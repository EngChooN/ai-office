/** Squirrel(윈도우 설치형)이 설치·업데이트·제거 때 앱을 이 인자로 한 번 실행한다. 그 밖은 null */
export type SquirrelEvent = 'install' | 'updated' | 'uninstall' | 'obsolete'

export const squirrelEventOf = (argv: readonly string[]): SquirrelEvent | null => {
  const arg = argv[1]
  switch (arg) {
    case '--squirrel-install':
      return 'install'
    case '--squirrel-updated':
      return 'updated'
    case '--squirrel-uninstall':
      return 'uninstall'
    case '--squirrel-obsolete':
      return 'obsolete'
    default:
      return null
  }
}
