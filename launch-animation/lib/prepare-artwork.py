# -*- coding: utf-8 -*-
r"""DSH启动动画 · 素材重算（内置版）

换图时由宿主半边调用，用**和出厂素材完全相同的算法**生成两样东西：
  1. artwork.jpg      成品图：3:2 中心裁切 → 1536×1024 JPEG(q88)
  2. contours.json    线稿路径：bilateralFilter → Canny → 形态学闭运算 → findContours → approxPolyDP

用法：
    py prepare-artwork.py <源图> <输出目录> [档位 sparse|medium|dense]

输出：stdout 打印一行 JSON（宿主半边解析它拿结果），形如
    {"ok": true, "preset": "dense", "artwork": {...}, "contours": {"paths":190,"points":13726,...}}
失败时打印 {"ok": false, "error": "..."} 并以非 0 退出。
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

CANVAS_W, CANVAS_H = 1536, 1024

PRESETS: dict[str, dict] = {
    "sparse": dict(bilateral_d=5, bilateral_sc=30, bilateral_ss=30, canny_lo=62, canny_hi=165,
                   min_len=60.0, eps=1.8, max_paths=40, max_total=200000.0, min_pts=8),
    "medium": dict(bilateral_d=5, bilateral_sc=28, bilateral_ss=28, canny_lo=42, canny_hi=118,
                   min_len=30.0, eps=1.2, max_paths=90, max_total=260000.0, min_pts=6),
    "dense": dict(bilateral_d=5, bilateral_sc=22, bilateral_ss=22, canny_lo=28, canny_hi=92,
                  min_len=14.0, eps=0.7, max_paths=190, max_total=420000.0, min_pts=4),
}


def fail(message: str) -> int:
    print(json.dumps({"ok": False, "error": message}, ensure_ascii=False))
    return 1


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        return fail("用法：prepare-artwork.py <源图> <输出目录> [档位]")

    try:
        import cv2
        import numpy as np
    except Exception as error:  # noqa: BLE001 - 要把真实原因回报给调用方
        return fail(f"缺少 Python 图像库（{error}）。需要 opencv-python 与 numpy。")

    source = Path(argv[1])
    out_dir = Path(argv[2])
    preset_name = argv[3] if len(argv) > 3 else "dense"
    if preset_name not in PRESETS:
        return fail(f"未知档位：{preset_name}")
    if not source.is_file():
        return fail(f"源图不存在：{source}")

    def imread_unicode(path: Path):
        data = np.fromfile(str(path), dtype=np.uint8)
        image = cv2.imdecode(data, cv2.IMREAD_UNCHANGED)
        return image

    def center_crop_to_ratio(image, ratio: float):
        height, width = image.shape[:2]
        if width / height > ratio:
            crop_width = int(round(height * ratio))
            left = (width - crop_width) // 2
            return image[:, left:left + crop_width]
        crop_height = int(round(width / ratio))
        top = (height - crop_height) // 2
        return image[top:top + crop_height, :]

    def to_bgr(image):
        if image.ndim == 2:
            return cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
        if image.shape[2] == 4:
            return cv2.cvtColor(image, cv2.COLOR_BGRA2BGR)
        return image

    try:
        image = imread_unicode(source)
        if image is None:
            return fail(f"读不出图片（格式不支持或文件损坏）：{source}")
        image = to_bgr(image)
        if image.shape[0] < 64 or image.shape[1] < 64:
            return fail("图片太小了（至少 64×64），请换一张。")
        image = center_crop_to_ratio(image, CANVAS_W / CANVAS_H)
        image = cv2.resize(image, (CANVAS_W, CANVAS_H), interpolation=cv2.INTER_AREA)


        cfg = PRESETS[preset_name]
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        gray = cv2.bilateralFilter(gray, cfg["bilateral_d"], cfg["bilateral_sc"], cfg["bilateral_ss"])
        edges = cv2.Canny(gray, cfg["canny_lo"], cfg["canny_hi"], L2gradient=True)
        edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, np.ones((2, 2), np.uint8))

        contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
        candidates: list[tuple[float, list[list[int]]]] = []
        for contour in contours:
            length = float(cv2.arcLength(contour, False))
            if length < cfg["min_len"]:
                continue
            approx = cv2.approxPolyDP(contour, cfg["eps"], False)
            pts = [[int(p[0][0]), int(p[0][1])] for p in approx]
            if len(pts) < cfg["min_pts"]:
                continue
            candidates.append((length, pts))

        candidates.sort(key=lambda item: item[0], reverse=True)
        kept: list[list[list[int]]] = []
        total = 0.0
        for index, (length, pts) in enumerate(candidates):
            if len(kept) >= cfg["max_paths"]:
                break
            if index > 0 and total + length > cfg["max_total"]:
                continue
            kept.append(pts)
            total += length

        if not kept:
            return fail("这张图算不出线稿（几乎没有边缘）。换一张对比更明显的图试试。")
        # 先算线稿、后写文件：算不出线稿（纯色图、几乎没边缘）时直接失败，
        # 不会留下「新图 + 旧线稿」的半套素材。
        out_dir.mkdir(parents=True, exist_ok=True)
        art_target = out_dir / "artwork.jpg"
        # 2026-10-11：Windows 上 cv2.imwrite 对「含中文的输出路径」会静默失败
        # （实测 OpenCV 5.0.0：ASCII 目录成功、中文目录不报错也不落文件，然后被下面的
        # is_file() 判成"不可写"）。改成 imencode 出字节、再用 Python 自己的 open() 写——
        # open() 走 Unicode 路径，任何语言的目录名都能写。
        ok_encode, encoded = cv2.imencode(".jpg", image, [int(cv2.IMWRITE_JPEG_QUALITY), 88])
        if not ok_encode:
            return fail("成品图编码失败（JPEG 编码器没有输出）")
        try:
            art_target.write_bytes(encoded.tobytes())
        except OSError as exc:
            return fail(f"成品图写入失败：{exc}")
        if not art_target.is_file():
            return fail("成品图写入失败（输出目录不可写？）")

        contour_payload = {
            "canvas": [CANVAS_W, CANVAS_H],
            "preset": preset_name,
            "paths": kept,
            "points": sum(len(p) for p in kept),
            "source": source.name,
        }
        contour_target = out_dir / "contours.json"
        contour_target.write_text(
            json.dumps(contour_payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    except Exception as error:  # noqa: BLE001
        return fail(f"处理失败：{error}")

    print(json.dumps({
        "ok": True,
        "preset": preset_name,
        "source": str(source),
        "sourceName": source.name,
        "canvas": [CANVAS_W, CANVAS_H],
        "artwork": {"path": str(art_target), "bytes": art_target.stat().st_size},
        "contours": {"path": str(contour_target), "bytes": contour_target.stat().st_size,
                     "paths": len(kept), "points": contour_payload["points"]},
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
