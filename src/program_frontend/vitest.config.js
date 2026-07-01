import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// 저장소 루트를 root 로 삼아 tests/ 와 src/ 를 한 프로젝트로 묶는다.
// (제출 규격상 테스트는 저장소 루트의 tests/program_frontend/ 에 위치)
const repoRoot = resolve(__dirname, "..", "..");

export default defineConfig({
  // node_modules 가 src/program_frontend 아래라 serving 루트가 어긋나므로
  // 저장소 루트 전체를 파일 접근 허용 목록에 넣는다.
  server: { fs: { allow: [repoRoot] } },
  test: {
    root: repoRoot,
    environment: "jsdom",
    include: ["tests/program_frontend/**/*.test.js"],
    reporters: ["default", "junit"],
    outputFile: { junit: "test-results/program_frontend/junit.xml" },
  },
});
