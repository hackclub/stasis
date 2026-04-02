export interface BlueprintProject {
  id: number
  title: string
  description: string | null
  tier: number | null
  projectType: string | null
  ysws: string | null
  repoLink: string | null
  demoLink: string | null
  hoursLogged: number | null
  createdAt: string | null
  journalMarkdown: string | null
}

function extractField(section: string, label: string): string | null {
  const lines = section.split("\n")
  for (const line of lines) {
    const prefix = "**" + label + ":** "
    if (line.startsWith(prefix)) {
      return line.slice(prefix.length).trim()
    }
  }
  return null
}

export function parseBlueprintMarkdown(markdown: string): BlueprintProject[] {
  const trimmed = markdown.trim()
  if (trimmed === "No Unfinished Projects") return []

  const sections = trimmed.split(/\n\n---\n\n/).map(s => s.trim()).filter(Boolean)

  return sections.map(section => {
    const titleMatch = section.match(/^## (.+?)\s+\(ID: (\d+)\)/m)

    const tierStr = extractField(section, "Tier")
    const hoursStr = extractField(section, "Hours Logged")

    // Extract journal entries section (everything after "### Journal Entries")
    let journalMarkdown: string | null = null
    const journalIdx = section.indexOf("### Journal Entries")
    if (journalIdx !== -1) {
      journalMarkdown = section.substring(journalIdx + "### Journal Entries".length).trim()
    }

    return {
      id: titleMatch ? parseInt(titleMatch[2], 10) : 0,
      title: titleMatch ? titleMatch[1] : "Unknown",
      description: extractField(section, "Description"),
      tier: tierStr ? parseInt(tierStr, 10) : null,
      projectType: extractField(section, "Type"),
      ysws: extractField(section, "YSWS"),
      repoLink: extractField(section, "Repo"),
      demoLink: extractField(section, "Demo"),
      hoursLogged: hoursStr ? parseFloat(hoursStr) : null,
      createdAt: extractField(section, "Created"),
      journalMarkdown,
    }
  })
}
