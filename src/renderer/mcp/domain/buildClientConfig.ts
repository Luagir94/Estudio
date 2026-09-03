// Pure, framework-free (mcp-app-control task 15.2): builds the exact
// `{ command, args, env }` snippet documented in `docs/development.md`'s
// "Point your MCP client at the shim" section, from the real shim path and
// token instead of one hand-copied from docs. No IPC, no React — nothing
// here needs a Zod parse because nothing here reads untrusted input.
export function buildClientConfig(shimPath: string, token: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        'course-companion': {
          command: 'node',
          args: [shimPath],
          env: { COURSE_COMPANION_MCP_TOKEN: token }
        }
      }
    },
    null,
    2
  )
}
