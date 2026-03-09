class Tahuna < Formula
  desc "Tahuna CLI for ML training orchestration"
  homepage "https://github.com/pazuzzu/tahuna"
  version "0.1.1"

  on_macos do
    if Hardware::CPU.arm?
      c98f8e73d7d6a19b0cd3b65059dea5912320bfa1436be4dbf3994570c78d279"
    else
      d380664cd83dabe1222d926b8328180483f75c00d45669a36d031dc6af8dd89"
    end
  end

  on_linux do
    if Hardware::CPU.intel?
      c9a722b1a69598ebcb2a716ebb3e95f99646e9804842cbd036da726983"
    end
  end

  def install
    bin.install "tahuna"
  end

  test do
    assert_match("tahuna #{version}", shell_output("#{bin}/tahuna version").strip)
  end
end
