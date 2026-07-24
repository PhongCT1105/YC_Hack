const COLORS = ['Indigo', 'Amber', 'Coral', 'Jade', 'Slate', 'Violet', 'Crimson', 'Teal', 'Ochre', 'Pearl']
const ANIMALS = ['Fox', 'Owl', 'Lynx', 'Heron', 'Otter', 'Falcon', 'Badger', 'Ibis', 'Marten', 'Wren']

export function randomCodename(): string {
  const c = COLORS[Math.floor(Math.random() * COLORS.length)]
  const a = ANIMALS[Math.floor(Math.random() * ANIMALS.length)]
  return `${c} ${a}`
}
