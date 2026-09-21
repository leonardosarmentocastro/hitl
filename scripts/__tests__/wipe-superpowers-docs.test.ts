import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("../hitl/wipe-superpowers-docs.sh", import.meta.url));

function tempRepo(withDocs: boolean) {
  const dir = mkdtempSync(join(tmpdir(), "wiperepo-"));
  const git = (args: string) =>
    execFileSync("bash", ["-c", `git ${args}`], { cwd: dir, encoding: "utf8" });
  git("init -q -b main");
  git('config user.email "t@example.com"');
  git('config user.name "t"');
  writeFileSync(join(dir, "README.md"), "seed\n");
  if (withDocs) {
    mkdirSync(join(dir, "docs/superpowers/specs"), { recursive: true });
    writeFileSync(join(dir, "docs/superpowers/specs/a-design.md"), "spec\n");
  }
  git("add -A");
  git("commit -q -m seed");
  return { dir, git };
}

describe("wipe-superpowers-docs.sh", () => {
  it("deletes docs/superpowers and creates exactly one commit", () => {
    const { dir, git } = tempRepo(true);
    const before = git("rev-list --count HEAD").trim();
    const out = execFileSync("bash", [SCRIPT], { cwd: dir, encoding: "utf8" });
    expect(out).toContain("wiped");
    expect(git("ls-tree -r --name-only HEAD")).not.toContain("docs/superpowers");
    expect(Number(git("rev-list --count HEAD").trim())).toBe(Number(before) + 1);
  });

  it("is a no-op when docs/superpowers is absent", () => {
    const { dir, git } = tempRepo(false);
    const before = git("rev-list --count HEAD").trim();
    const out = execFileSync("bash", [SCRIPT], { cwd: dir, encoding: "utf8" });
    expect(out).toContain("nothing to wipe");
    expect(git("rev-list --count HEAD").trim()).toBe(before);
  });

  it("is idempotent — a second run creates no further commit", () => {
    const { dir, git } = tempRepo(true);
    execFileSync("bash", [SCRIPT], { cwd: dir, encoding: "utf8" });
    const after = git("rev-list --count HEAD").trim();
    execFileSync("bash", [SCRIPT], { cwd: dir, encoding: "utf8" });
    expect(git("rev-list --count HEAD").trim()).toBe(after);
  });
});
