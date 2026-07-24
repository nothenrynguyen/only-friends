import { describe, expect, it } from "vitest";
import {
  compareLists,
  parseInstagramFiles,
  parseInstagramHtml,
  parseInstagramJson,
} from "./instagram";

const relationship = (username: string) => ({
  title: "",
  media_list_data: [],
  string_list_data: [
    {
      href: `https://www.instagram.com/${username}`,
      value: username,
      timestamp: 1_700_000_000,
    },
  ],
});

describe("Instagram export parsing", () => {
  it("parses the common followers JSON shape", () => {
    const json = JSON.stringify([relationship("Alice"), relationship("bob.test")]);
    expect(parseInstagramJson(json)).toEqual(["alice", "bob.test"]);
  });

  it("parses the common following JSON wrapper", () => {
    const json = JSON.stringify({
      relationships_following: [relationship("charlie"), relationship("Alice")],
    });
    expect(parseInstagramJson(json)).toEqual(["alice", "charlie"]);
  });

  it("parses Instagram profile links from HTML", () => {
    const html = `
      <a href="https://www.instagram.com/Alice/">Alice</a>
      <a href="https://instagram.com/_u/bob.test">bob.test</a>
      <a href="https://example.com/not-instagram">ignore me</a>
    `;
    expect(parseInstagramHtml(html)).toEqual(["alice", "bob.test"]);
  });

  it("uses all split follower files and ignores the following file", async () => {
    const followerOne = new File(
      [JSON.stringify([relationship("alice")])],
      "followers_1.json",
      { type: "application/json" },
    );
    const followerTwo = new File(
      [JSON.stringify([relationship("bob")])],
      "followers_2.json",
      { type: "application/json" },
    );
    const following = new File(
      [JSON.stringify({ relationships_following: [relationship("charlie")] })],
      "following.json",
      { type: "application/json" },
    );

    const result = await parseInstagramFiles(
      [followerOne, followerTwo, following],
      "followers",
    );

    expect(result.usernames).toEqual(["alice", "bob"]);
    expect(result.parsedFileNames).toHaveLength(2);
    expect(result.skippedFileCount).toBe(1);
  });
});

describe("list comparison", () => {
  it("separates one-way relationships and mutuals", () => {
    expect(
      compareLists(["alice", "bob", "dana"], ["bob", "charlie", "dana"]),
    ).toEqual({
      notFollowingBack: ["charlie"],
      youDoNotFollow: ["alice"],
      mutuals: ["bob", "dana"],
    });
  });
});
