import { describe, expect, it } from "vitest";
import { beats, contestedReleases, remoteLocks, type LockClient } from "./lock-tiebreak";

/** Soft-lock tiebreak policy unit tests (collab-presence 0007). */

function client(userId: string, clientId: number, selection: string[]): LockClient {
  return { userId, clientId, name: userId, selection };
}

describe("beats", () => {
  it("orders lexicographically on (userId, clientId)", () => {
    expect(beats({ userId: "alice", clientId: 9 }, { userId: "bob", clientId: 1 })).toBe(true);
    expect(beats({ userId: "bob", clientId: 1 }, { userId: "alice", clientId: 9 })).toBe(false);
    // Same user's two tabs fall to clientId.
    expect(beats({ userId: "alice", clientId: 1 }, { userId: "alice", clientId: 2 })).toBe(true);
    expect(beats({ userId: "alice", clientId: 2 }, { userId: "alice", clientId: 1 })).toBe(false);
  });
});

describe("remoteLocks", () => {
  const self = { userId: "mid", clientId: 50, selection: [] as string[] };

  it("unions every other client's selection with the winning holder's name", () => {
    const locks = remoteLocks(self, [
      client("zed", 9, ["u1", "u2"]),
      client("alice", 1, ["u2"]), // alice beats zed → she is u2's holder
    ]);
    expect(locks).toEqual([
      { uuid: "u1", name: "zed" },
      { uuid: "u2", name: "alice" },
    ]);
  });

  it("excludes uuids the local client holds AND wins, keeps ones it loses", () => {
    const locks = remoteLocks({ userId: "mid", clientId: 50, selection: ["won", "lost"] }, [
      client("zed", 9, ["won"]), // mid < zed → local wins → not locked for us
      client("alice", 1, ["lost"]), // alice < mid → local loses → stays locked
    ]);
    expect(locks).toEqual([{ uuid: "lost", name: "alice" }]);
  });

  it("is empty with no other clients", () => {
    expect(remoteLocks(self, [])).toEqual([]);
  });
});

describe("contestedReleases", () => {
  it("releases only uuids a WINNING peer also holds, blaming the strongest", () => {
    const self = { userId: "mid", clientId: 50, selection: ["a", "b", "c"] };
    const release = contestedReleases(self, [
      client("alice", 1, ["a"]), // wins → release a
      client("zed", 9, ["b"]), // loses → keep b (zed releases, not us)
      client("bob", 2, ["c"]), // wins → release c
    ]);
    expect(release).toEqual({ uuids: ["a", "c"], holder: "alice" });
  });

  it("returns null when nothing is contested or every contest is won", () => {
    const self = { userId: "alice", clientId: 1, selection: ["a"] };
    expect(contestedReleases(self, [client("bob", 2, ["a"])])).toBeNull();
    expect(contestedReleases(self, [client("bob", 2, ["other"])])).toBeNull();
    expect(contestedReleases({ ...self, selection: [] }, [client("bob", 2, ["a"])])).toBeNull();
  });

  it("own-user other tab contests fall to clientId", () => {
    const tab2 = { userId: "alice", clientId: 7, selection: ["a"] };
    expect(contestedReleases(tab2, [client("alice", 3, ["a"])])).toEqual({
      uuids: ["a"],
      holder: "alice",
    });
    const tab1 = { userId: "alice", clientId: 3, selection: ["a"] };
    expect(contestedReleases(tab1, [client("alice", 7, ["a"])])).toBeNull();
  });
});
