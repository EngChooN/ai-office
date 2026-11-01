/** 화면에 보일 오류 문구: Electron IPC 포장("Error invoking remote method '…': ")과 오류 이름 접두어("InvalidArgsError: ")를 지운다 */
export function ipcErrorText(e: unknown, fallback = ''): string {
  if (!(e instanceof Error)) return fallback
  return e.message.replace(/^Error invoking remote method '[^']*': /, '').replace(/^(?:[A-Z]\w*)?Error: /, '') || fallback
}
