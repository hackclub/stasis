/** Ensure blank lines around image tags so they render as block elements instead of inline */
export function fixMarkdownImages(source: string): string {
  return source
    .replace(/([^\n])\n(!\[)/g, '$1\n\n$2')
    .replace(/(!\[.*?\]\(.*?\))\n([^\n])/g, '$1\n\n$2');
}
