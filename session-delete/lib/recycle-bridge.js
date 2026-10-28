/**
 * 回收站桥：把会话目录送进 Windows 系统回收站（`SHFileOperationW` + `FOF_ALLOWUNDO`）。
 *
 * 本插件只用到它的 `delete` 动作（`restore` / `detect` 留作手工排障用）。
 * 改它之前先读下面的取舍记录。
 *
 * @module dsh-session-delete/recycle-bridge
 */
/**
 * 回收站桥的 PowerShell 脚本。
 *
 * 为什么是 PowerShell：把**整个目录**送进 Windows 回收站、并且还能拿回原始路径，
 * 只有 Shell API 这条路。本机实测（见下面的取舍）：
 *   - `SHFileOperationW` + `FOF_ALLOWUNDO` 是唯一可靠地把目录送进回收站的办法；
 *   - `Shell.Application` COM 在本机**根本用不了**：它的 `Path` 属性在"隐藏已知扩展名"
 *     时退化成显示名，`InvokeVerb("restore")` 也找不到目标 —— 所以它一次都没被使用；
 *   - 回收站每个条目有两份元数据：`$I…` 记原始路径，`$R…` 是内容本体。
 *     解析 `$I…` 就能拿回删除前的绝对路径，再把 `$R…` 搬回去就是还原。
 *
 * ⚠️ 这个脚本必须以 **UTF-8 + BOM** 落盘：Windows PowerShell 5.1 在没有 BOM 时
 * 按 ANSI 读取 .ps1，中文注释会被拆坏、报 `MissingEndCurlyBrace`（踩过一次）。
 * 《也因此这里用模板字符串保存，写盘时补 BOM。》
 */
export const RECYCLE_PS1 = `# dsh-session-delete · 回收站桥（recycle bridge）
#
# Contract:
#   powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File recycle.ps1 -In <payload.json> -Out <result.json>
#   payload: { "action": "delete" | "restore" | "detect", "paths": [...] }
#   result : { ok, error, deleted, failed, index, matches, permanent, binProbe }
#
# delete  : 把 paths 送进 Windows 回收站（SHFileOperationW + FOF_ALLOWUNDO），删前记下原始路径由系统写进说明文件；
#           回收站被禁用/配额满时它会静默变成永久删除，所以删完要对账索引，如实回传 permanent；
#           动手之前先做一段只读探测（binProbe，见 Probe-BinHealth），宿主据此把「可能永久丢失」说在确认框里
# restore : 按原始路径把回收站里的内容搬回去（找不到 = 用户已经清空过回收站，如实报错）
# detect  : 扫一遍回收站，回报 paths 里还有哪些仍然躺在里面（决定界面上的"撤销"还在不在）
param(
  [Parameter(Mandatory = $true)][string]$In,
  [Parameter(Mandatory = $true)][string]$Out
)

$ErrorActionPreference = 'Stop'
$dollar = [char]36

function Read-JsonFile([string]$path) {
  $text = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
  if ([string]::IsNullOrWhiteSpace($text)) { return @{} }
  return ($text | ConvertFrom-Json)
}

# 枚举本机各卷的回收站根（$Recycle.Bin）。不能写死 C: —— DSH_HOME 若在别的盘，
# 文件进的是那一卷的回收站，只扫 C: 会对账失败并误报 permanent。
function Get-RecycleBinRoots {
  $roots = New-Object System.Collections.Generic.List[string]
  $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  try {
    foreach ($drive in [System.IO.DriveInfo]::GetDrives()) {
      if (-not $drive.IsReady) { continue }
      # Fixed / Removable：会话目录可能在移动盘；Network 一般没有本机 $Recycle.Bin。
      if ($drive.DriveType -ne 'Fixed' -and $drive.DriveType -ne 'Removable') { continue }
      $candidate = [System.IO.Path]::Combine($drive.RootDirectory.FullName, ($dollar + 'Recycle.Bin'))
      if ((Test-Path -LiteralPath $candidate) -and $seen.Add($candidate)) {
        [void]$roots.Add($candidate)
      }
    }
  } catch {
    # 枚举失败时下面至少还有 C: 兜底
  }
  $fallback = 'C:\\' + $dollar + 'Recycle.Bin'
  if ((Test-Path -LiteralPath $fallback) -and $seen.Add($fallback)) {
    [void]$roots.Add($fallback)
  }
  return $roots
}

# 解析回收站说明文件：原始路径是 UTF-16LE，长度前缀在偏移 24、正文在 28。
function Read-Index {
  $items = @()
  foreach ($binRoot in (Get-RecycleBinRoots)) {
    $sidDirs = Get-ChildItem -LiteralPath $binRoot -Force -Directory -ErrorAction SilentlyContinue
    foreach ($sidDir in $sidDirs) {
      $metaFiles = Get-ChildItem -LiteralPath $sidDir.FullName -Force -Filter '$I*' -ErrorAction SilentlyContinue
      foreach ($f in $metaFiles) {
        try {
          $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
          if ($bytes.Length -lt 28) { continue }
          $size = [BitConverter]::ToInt64($bytes, 8)
          $deletedAt = [DateTime]::FromFileTime([BitConverter]::ToInt64($bytes, 16))
          $nameLen = [BitConverter]::ToInt32($bytes, 24)
          # 只认新版格式（Win10+）：$I 后面 6 位随机名 + 原扩展名，正文是 UTF-16LE 原始路径。
          # 老格式（Win8 及更早）这里读到 0，会自然被跳过 —— 那是十几年前删的东西，不该被我们还原。
          if ($nameLen -le 0) { continue }
          $take = $nameLen * 2
          if ((28 + $take) -gt $bytes.Length) { continue }
          $orig = [System.Text.Encoding]::Unicode.GetString($bytes, 28, $take).TrimEnd([char]0)
          $items += [pscustomobject]@{
            orig      = $orig
            name      = (Split-Path -Path $orig -Leaf)
            ifile     = $f.FullName
            rfile     = (Join-Path $sidDir.FullName ('$R' + $f.Name.Substring(2)))
            deletedAt = $deletedAt.ToString('o')
            size      = $size
          }
        } catch {
          # 单个坏条目不该毁掉整次扫描
        }
      }
    }
  }
  return $items
}

function Send-ToRecycleBin([string[]]$paths) {
  if (-not ('DshSessionDelete.Shell' -as [type])) {
    Add-Type -Namespace DshSessionDelete -Name Shell -MemberDefinition @'
[StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
public struct SHFILEOPSTRUCT {
  public IntPtr hwnd;
  public uint wFunc;
  public string pFrom;
  public string pTo;
  public ushort fFlags;
  public bool fAnyOperationsAborted;
  public IntPtr hNameMappings;
  public string lpszProgressTitle;
}
[DllImport("shell32.dll", CharSet=CharSet.Unicode)]
public static extern int SHFileOperation(ref SHFILEOPSTRUCT lpFileOp);
'@
  }
  $sb = New-Object System.Text.StringBuilder
  foreach ($p in $paths) { [void]$sb.Append($p); [void]$sb.Append([char]0) }
  [void]$sb.Append([char]0)
  $op = New-Object DshSessionDelete.Shell+SHFILEOPSTRUCT
  $op.wFunc = 3                                                          # FO_DELETE
  $op.pFrom = $sb.ToString()                                             # 双 null 结尾
  # FOF_WANTNUKEWARNING(0x4000)：回收站被禁用/配额满时「送回收站」会退化成永久删除。
  # 带上它，永久删除这条路径才是可检测的（NOCONFIRMATION 在场时它不弹窗，
  # 但语义声明在这里；真正的判定靠删完对账索引，见 delete 分支）。
  # 注意 fFlags 是 WORD（16 位）：曾误写 0x40000，赋值当场抛 UInt16 溢出。
  $op.fFlags = 0x40 -bor 0x10 -bor 0x4 -bor 0x400 -bor 0x200 -bor 0x4000  # ALLOWUNDO|NOCONFIRMATION|SILENT|NOERRORUI|NOCONFIRMMKDIR|WANTNUKEWARNING
  $rc = [DshSessionDelete.Shell]::SHFileOperation([ref]$op)
  return @{ rc = $rc; aborted = $op.fAnyOperationsAborted }
}

# ===== 删前只读探测（binProbe）================================================
# 在按下删除的**这一刻**先看这一卷的回收站靠不靠谱，采集到的事实写进结果 JSON，
# 判定表在宿主侧（lib/bin-status.js 的 decideBinStatus）—— 这里只采事实，不下结论。
# 铁律：只读、绝不阻塞删除 —— 整个函数体包在 try/catch 里，出任何异常都只是把
# error 记进事实（宿主据此判 unknown），删除照常进行。
#
# 采集两项事实：
#   ① HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\BitBucket\Volume\{卷GUID}
#      下的 NukeOnDelete —— 存在且为 1 = 该卷被配置成「跳过回收站、直接永久删除」。
#   ② SHQueryRecycleBin(卷根) —— shell32 的只读查询；返回非 S_OK = 回收站服务异常。
#
# 卷 GUID 从哪来（二选一，选了 Get-Volume）：
#   采用：盘符 → (Get-Volume -DriveLetter X).UniqueId（形如 \\?\Volume{GUID}\），
#        正则取大括号段 —— BitBucket\Volume 的键名就是这个带大括号的卷 GUID，
#        与盘符/挂载点无关。本机实测：C: 的 UniqueId 大括号段 == BitBucket 下的键名。
#   弃用：枚举 BitBucket\Volume 各键比对 MountVolume —— 本机实测它是「该卷回收站是否
#        启用」的 DWORD 开关（多数卷根本没设这个值），不是卷的身份标识，没法跟删除
#        路径对上号，所以不能用它反查。
function Probe-BinHealth([string]$targetPath) {
  $probe = [ordered]@{ volumeRoot = ''; volumeGuid = ''; nukeOnDelete = $null; recycleQueryOk = $false; error = '' }
  try {
    $root = [System.IO.Path]::GetPathRoot($targetPath)
    $probe.volumeRoot = [string]$root
    $letter = ("$root").TrimEnd([char]92).TrimEnd(':')
    $volume = Get-Volume -DriveLetter $letter -ErrorAction Stop
    $guid = [regex]::Match([string]$volume.UniqueId, '{[0-9a-fA-F-]{36}}').Value
    if ([string]::IsNullOrEmpty($guid)) { throw ("volume UniqueId has no brace GUID: " + $volume.UniqueId) }
    $probe.volumeGuid = $guid
    # 值/键不存在 = 没配置过（正常情况），所以这里绝不能用 -ErrorAction Stop；
    # 注册表读不到也不升级成异常 —— 后面的 SHQueryRecycleBin 会给出独立的第二项事实。
    $key = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\BitBucket\\Volume\\' + $guid
    $nuke = (Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue).NukeOnDelete
    if ($null -ne $nuke) { $probe.nukeOnDelete = [int]$nuke }
    if (-not ('DshSessionDelete.RecycleQuery' -as [type])) {
      Add-Type -Namespace DshSessionDelete -Name RecycleQuery -MemberDefinition @'
[StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
public struct SHQUERYRBINFO {
  public int cbSize;
  public long i64Size;
  public long i64NumItems;
}
[DllImport("shell32.dll", CharSet=CharSet.Unicode)]
public static extern int SHQueryRecycleBin(string pszRootPath, ref SHQUERYRBINFO pshqrbi);
'@
    }
    $rbinfo = New-Object DshSessionDelete.RecycleQuery+SHQUERYRBINFO
    $rbinfo.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf([type][DshSessionDelete.RecycleQuery+SHQUERYRBINFO])
    $hr = [DshSessionDelete.RecycleQuery]::SHQueryRecycleBin([string]$root, [ref]$rbinfo)
    # 非 S_OK 是「查出来的结论」不是「脚本出错」：如实记 false、error 保持干净，
    # 宿主对两者的处置不同（false → suspect，error → unknown）。
    if ($hr -eq 0) { $probe.recycleQueryOk = $true }
  } catch {
    $probe.error = ("{0}" -f $_.Exception.Message)
  }
  return $probe
}

$result = [ordered]@{
  ok = $false; error = ''; deleted = @(); failed = @(); index = @(); matches = @(); permanent = $false; binProbe = $null
}

try {
  $payload = Read-JsonFile $In
  $action = [string]$payload.action
  if ([string]::IsNullOrWhiteSpace($action)) { $action = 'detect' }
  $paths = @()
  if ($null -ne $payload.paths) { $paths = @($payload.paths | Where-Object { $_ -ne $null -and "$_" -ne '' }) }

  switch ($action) {
    'delete' {
      $present = @()
      foreach ($p in $paths) { if (Test-Path -LiteralPath $p) { $present += $p } }
      $missing = @($paths | Where-Object { $present -notcontains $_ })
      if ($present.Count -eq 0) {
        $result.ok = $true
        $result.error = 'nothing on disk to remove'
      } else {
        # 删前只读探测（见 Probe-BinHealth）：事实写进 binProbe，任何异常都不许挡住删除。
        # 探第一条待删路径所在的卷 —— 会话目录与投影缓存同属 DSH home，正常都在同一卷。
        try { $result.binProbe = Probe-BinHealth $present[0] } catch { $result.binProbe = @{ error = ("{0}" -f $_.Exception.Message) } }
        $r = Send-ToRecycleBin $present
        # 返回码非零也可能「前面几条已经移走、后面才失败」：不能直接抛错，必须逐项核对。
        # SHFileOperation 也会静默跳过锁住的条目，所以无论如何都要回头确认原路径真的没了。
        $stillThere = @()
        foreach ($p in $present) { if (Test-Path -LiteralPath $p) { $stillThere += $p } }
        # 部分成功也要把“已经删掉的”和“还留在盘上的”如实带回去，
        # 否则宿主只知道整体失败，已经进回收站的目录就成了没账的孤儿。
        $gone = @($present | Where-Object { $stillThere -notcontains $_ })
        $result.deleted = $gone
        # 对账：回收站被禁用/配额满时，FOF_ALLOWUNDO 会静默变成永久删除，而
        # SHFileOperation 依然返回成功。所以「离开磁盘」不等于「进了回收站」——
        # 只有原始路径真的出现在回收站索引（$I 文件）里才算可还原；凭空蒸发的
        # 按永久删除如实上报，宿主与界面才能把话说清楚。
        # Windows 路径大小写不敏感：用 IgnoreCase 集合对账，避免 $I 里大小写与入参不一致时误报 permanent。
        $inBin = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
        foreach ($entry in (Read-Index)) { [void]$inBin.Add([string]$entry.orig) }
        $result.permanent = @($gone | Where-Object { -not $inBin.Contains([string]$_) }).Count -gt 0
        $result.failed = @(@($stillThere | ForEach-Object { @{ path = $_; error = 'still on disk' } }) +
          @($missing | ForEach-Object { @{ path = $_; error = 'not on disk' } }))
        if ($stillThere.Count -gt 0) {
          $result.ok = $false
          $result.error = if ($r.rc -ne 0) {
            ("partial (rc=0x{0:X}): still on disk: " -f $r.rc) + ($stillThere -join '; ')
          } else {
            ("partial: still on disk: " + ($stillThere -join '; '))
          }
        } elseif ($r.rc -ne 0) {
          # 文件确实都不在了：以逐项核对为准，返回码只记一笔。
          $result.ok = $true
          $result.error = ("recycle reported code 0x{0:X} but every path is gone" -f $r.rc)
        } else {
          $result.ok = $true
        }
      }
    }
    'restore' {
      $index = Read-Index
      # 一个叶子名可能对应**多条**回收站条目（同一个会话 id 同时存在于两个工作区分桶时
      # 就是这样：删的时候两条都进去了）。所以这里收集**所有**匹配项，最后按回收站
      # 条目（$I 文件）去重 —— 不能只取第一条，也不能按叶子名去重，否则只会捞回一条。
      $plan = @{}
      foreach ($p in $paths) {
        $leaf = Split-Path -Path $p -Leaf
        foreach ($hit in ($index | Where-Object { $_.orig -eq $p -or $_.name -eq $leaf })) {
          $plan[$hit.ifile] = $hit
        }
      }
      $done = @()
      $bad = @()
      foreach ($hit in $plan.Values) {
        # 单个条目失败不影响其它条目
        try {
          $parent = Split-Path -Path $hit.orig -Parent
          if (-not [string]::IsNullOrWhiteSpace($parent)) {
            [void](New-Item -ItemType Directory -Path $parent -Force)
          }
          if (Test-Path -LiteralPath $hit.orig) {
            Remove-Item -LiteralPath $hit.orig -Recurse -Force
          }
          Move-Item -LiteralPath $hit.rfile -Destination $hit.orig -Force
          Remove-Item -LiteralPath $hit.ifile -Force
          $done += $hit.orig
        } catch {
          $bad += @{ path = $hit.orig; error = ("{0}" -f $_.Exception.Message) }
        }
      }
      $result.ok = ($bad.Count -eq 0)
      $result.deleted = $done
      $result.matches = $done
      $result.failed = @($bad)
      if ($done.Count -eq 0 -and $bad.Count -eq 0) { $result.ok = $false }
      if (-not $result.ok) {
        if ($bad.Count -gt 0) {
          $result.error = ("{0}" -f $bad[0].error)
        } else {
          $result.error = 'not in recycle bin (emptied?)'
        }
      }
    }
    'detect' {
      $index = Read-Index
      $result.ok = $true
      $result.index = $index
      $wanted = @{}
      foreach ($p in $paths) { $wanted[(Split-Path -Path $p -Leaf)] = $p }
      $hits = @()
      foreach ($item in $index) {
        if ($wanted.ContainsKey($item.name)) { $hits += $item.orig }
      }
      $result.matches = $hits
    }
    default {
      throw ("unknown action: " + $action)
    }
  }
} catch {
  $result.ok = $false
  $result.error = ("{0}" -f $_.Exception.Message)
}

$json = $result | ConvertTo-Json -Depth 6 -Compress
[System.IO.File]::WriteAllText($Out, $json, (New-Object System.Text.UTF8Encoding($false)))
`

