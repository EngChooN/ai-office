// 모바일 빌드 진입: ① 원격 어댑터 설치(window.office) ② 데스크톱과 같은 진입(main.tsx) 그대로
// ESM은 적힌 순서대로 실행하므로 main.tsx가 window.office를 읽기 전에 설치가 끝난다
import './install'
import '../main'
