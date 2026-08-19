// 灵感库示例数据（mock，后续接 MCP / 后端接口替换）
// 结构与「按日期回看的灵感白板」一致，支持类型色与 AI 标签字段。

export const stickies = [
  {
    id: 1, type: '想法', time: '09:42', pos: 's1',
    text: '"如果按日期回看灵感，会不会更像回到当天？"',
    attachments: [{ kind: 'img', label: '2' }, { kind: 'audio', label: '01:24' }],
    aiTag: 'AI 标签：产品 / 内容',
  },
  {
    id: 2, type: '引用', time: '11:08', pos: 's2', quote: true,
    text: '"桂花落在车座上，气味比照片更早把秋天保存下来。"',
    used: '用于 2 个项目',
  },
  {
    id: 3, type: '随感', time: '15:21', pos: 's3',
    text: '便利店夜班的灯是「不要过来」还是「随时可以」？两个方向其实只差一块招牌。',
    attachments: [{ kind: 'img', label: '1' }],
  },
  {
    id: 4, type: '待办', time: '17:30', pos: 's4',
    text: '周五合作视频开场：用一个"还没说清的念头"做钩子，前 8 秒留住观众。',
    attachments: [{ kind: 'audio', label: '02:11' }, { kind: 'link', label: '1' }],
  },
  {
    id: 5, type: '想法', time: '19:50', pos: 's5',
    text: '把灵感按"光"分类：晨光、午后光、路灯。',
  },
  {
    id: 6, type: '引用', time: '21:14', pos: 's6', quote: true,
    text: '"手写招牌的失误比完美字体更记得住。"',
  },
  {
    id: 7, type: '随感', time: '22:03', pos: 's7',
    text: '等红灯的人不焦虑，因为知道下一秒会变绿。写作也需要这种"等红灯"的段落。',
    used: '用于 1 个项目',
  },
]

// 星云视图聚类节点
export const clusters = [
  { id: 'c1', color: 'c1', top: '25%', left: '20%', label: '"桂花落在车座上…"' },
  { id: 'c2', color: 'c2', top: '18%', left: '50%', label: '"按日期回看 = 回到当天？"' },
  { id: 'c3', color: 'c3', top: '46%', left: '42%', label: '主题 · 写作' },
  { id: 'c4', color: 'c4', top: '65%', left: '25%', label: '"便利店夜班的灯…"' },
  { id: 'c5', color: 'c5', top: '33%', left: '78%', label: '"周五合作视频开场"' },
  { id: 'c6', color: 'c1', top: '75%', left: '78%', label: '"等红灯的段落"' },
]