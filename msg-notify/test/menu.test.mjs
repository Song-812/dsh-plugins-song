import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

function mount(menuAvailable) {
  let definition, renderPanel
  const values = new Map()
  const localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
    useState: value => [typeof value === 'function' ? value() : value, () => {}],
    useRef: () => ({ current: null }),
    useEffect: () => {},
  }
  function Menu() {}
  const window = { __ModuleLoader__: { load: value => { definition = value } } }
  new Function('window', 'localStorage', 'document', source)(window, localStorage, {})
  const plugin = definition.factory(name => {
    if (name === 'react') return react
    if (name === '@deepseek-ai/dsh-client-ui-primitives' && menuAvailable) return { Menu }
    throw Error('module unavailable')
  })
  const slots = { inject: (_name, callback) => callback(), register: (_spec, render) => { renderPanel = render; return () => {} } }
  const scope = { get: key => key === 'slots' ? slots : undefined, effect: callback => callback() }
  plugin.apply({ get: () => undefined, effect: () => () => {}, inject: (deps, callback) => { if (deps.includes('slots')) callback(scope) } })
  function expand(node) {
    if (node == null || typeof node !== 'object') return node
    if (typeof node.type === 'function' && node.type !== Menu) return expand(node.type({ ...node.props, children: node.children }))
    return { ...node, children: node.children.map(expand) }
  }
  function find(node, predicate, out = []) {
    if (node == null || typeof node !== 'object') return out
    if (predicate(node)) out.push(node)
    for (const child of node.children ?? []) find(child, predicate, out)
    return out
  }
  return { Menu, render: () => expand(renderPanel()), find, values }
}

test('八个选项均使用官方菜单；选择静音仍保存并禁用重复和试听', () => {
  const harness = mount(true)
  let tree = harness.render()
  const menus = harness.find(tree, node => node.type === harness.Menu)
  assert.equal(menus.length, 8)
  assert.equal(harness.find(tree, node => node.type === 'select').length, 0)
  assert.equal(menus[0].props.anchor.props['aria-label'], '需要回答 音色')
  assert.deepEqual(menus[0].props.items.map(item => item.id), ['ding', 'fault', 'tap', 'none'])
  menus[0].props.onSelect('none')
  assert.equal(JSON.parse(harness.values.get('dsh-msg-notify.v1')).kinds.question.tone, 'none')
  tree = harness.render()
  assert.equal(harness.find(tree, node => node.type === harness.Menu && node.props.anchor.props['aria-label'] === '需要回答 重复')[0].props.anchor.props.disabled, true)
  assert.equal(harness.find(tree, node => node.type === 'button' && node.props['aria-label'] === '需要回答 试听')[0].props.disabled, true)
})

for (const [id, label] of [['question','需要回答'], ['done','输出完成'], ['failed','发生错误'], ['stalled','卡住']]) {
  test(`${label}：音色、重复方式分别保存，静音后只禁用本行`, () => {
    const harness = mount(true)
    const menu = name => harness.find(harness.render(), node => node.type === harness.Menu && node.props.anchor.props['aria-label'] === name)[0]
    menu(`${label} 音色`).props.onSelect('ding')
    menu(`${label} 重复`).props.onSelect('three')
    let stored = JSON.parse(harness.values.get('dsh-msg-notify.v1'))
    assert.equal(stored.kinds[id].tone, 'ding')
    assert.equal(stored.kinds[id].repeat, 'three')
    menu(`${label} 音色`).props.onSelect('none')
    stored = JSON.parse(harness.values.get('dsh-msg-notify.v1'))
    assert.equal(stored.kinds[id].tone, 'none')
    assert.equal(menu(`${label} 重复`).props.anchor.props.disabled, true)
    assert.equal(harness.find(harness.render(), node => node.type === 'button' && node.props['aria-label'] === `${label} 试听`)[0].props.disabled, true)
    const other = id === 'question' ? '输出完成' : '需要回答'
    assert.equal(menu(`${other} 重复`).props.anchor.props.disabled, false)
  })
}

test('官方菜单模块不可用时所有原生下拉框仍可保存', () => {
  const harness = mount(false)
  const tree = harness.render()
  assert.equal(harness.find(tree, node => node.type === harness.Menu).length, 0)
  const selects = harness.find(tree, node => node.type === 'select')
  assert.equal(selects.length, 8)
  for (const [id, label] of [['question','需要回答'], ['done','输出完成'], ['failed','发生错误'], ['stalled','卡住']]) {
    for (const [field, title, value] of [['tone','音色','fault'], ['repeat','重复','three']]) {
      const current = harness.find(harness.render(), node => node.type === 'select' && node.props['aria-label'] === `${label} ${title}`)[0]
      current.props.onChange({ target: { value } })
      assert.equal(JSON.parse(harness.values.get('dsh-msg-notify.v1')).kinds[id][field], value)
    }
  }
})
