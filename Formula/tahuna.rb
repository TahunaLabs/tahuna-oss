class Tahuna < Formula
  desc "Tahuna CLI for ML training orchestration"
  homepage "https://github.com/pazuzzu/tahuna"
  version "0.1.0"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/pazuzzu/tahuna/releases/download/v0.1.0/tahuna_darwin_arm64.tar.gz"
      sha256 "REPLACE_WITH_DARWIN_ARM64_SHA256"
    else
      url "https://github.com/pazuzzu/tahuna/releases/download/v0.1.0/tahuna_darwin_amd64.tar.gz"
      sha256 "REPLACE_WITH_DARWIN_AMD64_SHA256"
    end
  end

  on_linux do
    if Hardware::CPU.intel?
      url "https://github.com/pazuzzu/tahuna/releases/download/v0.1.0/tahuna_linux_amd64.tar.gz"
      sha256 "REPLACE_WITH_LINUX_AMD64_SHA256"
    end
  end

  def install
    bin.install "tahuna"
  end

  test do
    assert_match "tahuna", shell_output("#{bin}/tahuna version")
  end
end
