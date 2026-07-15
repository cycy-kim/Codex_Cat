# Codex Cat

Codex Cat은 Codex의 작업 상태를 VS Code 오른쪽 상태표시줄에 보여 주는 확장입니다.

- 설정 전: 정지 고양이와 `Setup`
- 훅 설치 후 동작 확인 전: 정지 고양이
- 대기 중: 정지 고양이
- Codex 작업 중: 춤추는 고양이 애니메이션

Codex가 `UserPromptSubmit` 훅을 보내면 애니메이션을 시작하고 `Stop` 훅을 보내면 종료합니다.

## 처음 설정하기

터미널이나 전역 `codex` 명령은 필요하지 않습니다.

1. 상태표시줄의 `🐱 Setup`을 클릭하고 설치를 승인합니다.
2. 오른쪽 아래 알림에서 **Review Hooks**를 클릭합니다.
3. `UserPromptSubmit`과 `Stop` 훅을 검토하고, 신뢰가 필요하다고 표시되면 신뢰합니다.
4. **Reload hooks**를 선택합니다.
5. Codex에 메시지를 보내 실제 동작을 확인합니다.

**Review Hooks**가 바로 열리지 않으면 Codex 사이드바의 톱니바퀴에서 **Codex Settings → Hooks**로 이동합니다. Codex는 훅의 현재 신뢰 상태를 다른 VS Code 확장에 공개하지 않으므로 Codex Cat은 상태표시줄에서 신뢰 여부를 추측해 표시하지 않습니다. 설치 직후에만 검토 안내를 보여 주고, 두 종류의 이벤트가 모두 도착하면 해당 구성이 동작한다고 기록합니다. Codex는 보안을 위해 새 훅이나 변경된 훅을 사용자가 직접 검토하고 신뢰하도록 요구하므로 이 단계는 자동화하지 않습니다.

설치 과정은 훅 스크립트를 `~/.codex-cat/codex-cat-hook.cjs`로 복사하고 `~/.codex/hooks.json`에 두 훅을 병합합니다. 기존 최상위 설정과 다른 훅은 보존하며, 기존 파일을 바꾸기 전 timestamp가 붙은 백업을 만듭니다.

## 명령

명령 팔레트에서 다음 명령을 사용할 수 있습니다.

- `Codex Cat: Install Hooks`: 최초 설치
- `Codex Cat: Reinstall Hooks`: 훅 정의와 실행 경로 복구 또는 갱신
- `Codex Cat: Uninstall Hooks`: Codex Cat 훅·실행 스크립트·로컬 이벤트 로그 제거
- `Codex Cat: Test Start`: 애니메이션 수동 시작
- `Codex Cat: Test Stop`: 애니메이션 수동 종료

재설치나 제거 시에도 다른 Codex 훅과 설정은 보존됩니다. 확장을 삭제할 때도 같은 정리 작업이 자동으로 실행됩니다. 확장 업데이트로 훅 스크립트가 바뀌면 상태표시줄에 `Update hooks`가 나타나며, 업데이트 후 변경된 훅을 다시 신뢰해야 합니다.

## 개발 실행

1. 의존성을 설치하고 컴파일합니다.

   ```bash
   npm install
   npm run compile
   ```

2. VS Code에서 이 프로젝트를 열고 `F5`를 누릅니다.
3. 열린 Extension Development Host 창에서 상태표시줄 안내를 따릅니다.

새 설치 흐름까지 확인하려면 명령 팔레트에서 `Codex Cat: Reinstall Hooks`를 실행합니다. 훅 정의가 이전에 동작한 구성과 같으면 확인 기록을 유지하며, 정의가 달라진 경우에만 다시 검토 안내를 표시합니다.

## 고양이 애니메이션 교체

원본 애니메이션 세트는 개발 전용 `animation-sources/` 폴더에서 관리합니다. 애니메이션을 바꿀 때는 `cat-animation.json`의 `framesRoot`를 이 폴더 안의 세트로 변경합니다.

```json
{
  "framesRoot": "./animation-sources/cat_line_svg_clean_bold_48frames_custom"
}
```

세트에 `sequence.json`이 있으면 `recommended_order`와 `recommended_timing_ms`를 그대로 사용합니다. 같은 SVG를 순서에 여러 번 넣어 반복할 수도 있습니다. `sequence.json`이 없으면 `frame_*.svg` 파일명 순서와 프레임당 100ms를 사용합니다. `F5`, `npm run compile`, 배포 빌드 전에 WOFF·프레임 코드·아이콘 등록이 자동으로 다시 생성됩니다. `preview_animation.svg` 같은 보조 SVG는 프레임으로 인식하지 않습니다.

선(`stroke`)으로 그린 SVG도 그대로 사용할 수 있습니다. 폰트를 생성할 때 선을 채움 외곽선으로 자동 변환하며 원본 SVG 파일은 수정하지 않습니다.

원본 SVG·미리보기·연락시트는 VSIX에서 제외되고, 런타임에는 생성된 `media/codex-cat-frames.woff`만 포함됩니다. TypeScript 모듈은 `dist/extension.js` 하나로 번들되므로 내부 파일을 나눠도 배포 파일 목록은 바뀌지 않습니다.

## 배포 확인

아래 명령은 빌드한 뒤 VSIX에 포함될 파일 목록을 출력합니다.

```bash
npm run package:check
```

실제 VSIX 파일은 다음 명령으로 만듭니다.

```bash
npm run package:vsix
```

## 이벤트 파일과 개인정보

훅은 다음 로컬 JSONL 파일에 이벤트를 추가합니다.

```text
~/.codex-cat/events.jsonl
```

각 줄에는 이벤트 종류, 세션 ID, turn ID, timestamp만 들어갑니다. 프롬프트 본문, 마지막 응답, transcript 내용은 사용하거나 기록하지 않습니다.

파일은 1MiB에 도달하면 새 이벤트를 기록하기 전에 비우며, 지원되는 운영체제에서는 사용자만 읽고 쓸 수 있도록 권한을 제한합니다. 훅 제거 또는 확장 삭제 시 이벤트 파일도 함께 제거합니다.

## 문제 해결

- 설치 후 애니메이션이 시작되지 않으면 고양이를 클릭하거나 Codex Settings → Hooks에서 두 훅을 검토하고 **Reload hooks**를 선택합니다.
- 수동 테스트만 동작하면 `Codex Cat: Reinstall Hooks`를 실행하고 변경된 두 훅을 다시 신뢰합니다.
- `~/.codex/config.toml` 또는 관리형 `requirements.toml`에 아래 설정이 있으면 훅이 비활성화됩니다.

  ```toml
  [features]
  hooks = false
  ```

- `~/.codex/hooks.json`이 올바른 JSON인지 확인합니다. Codex Cat은 파싱할 수 없는 기존 파일을 덮어쓰지 않습니다.
- 실제 이벤트 도착 여부는 `~/.codex-cat/events.jsonl`에서 확인할 수 있습니다.
