import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 상위 폴더(전표리더)에도 lockfile이 있어 루트 추론 경고가 난다. 이 앱 폴더로 못 박는다.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
