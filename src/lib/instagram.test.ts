import { describe, expect, it } from "vitest";
import {
  compareLists,
  parseInstagramExport,
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

  it("discovers both lists anywhere inside one complete export folder", async () => {
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
      [JSON.stringify({ relationships_following: [relationship("bob"), relationship("charlie")] })],
      "following.json",
      { type: "application/json" },
    );
    const unrelated = new File(
      [JSON.stringify({ likes_media_likes: [relationship("ignore_me")] })],
      "liked_posts.json",
      { type: "application/json" },
    );

    Object.defineProperty(followerOne, "webkitRelativePath", {
      value: "my-export/random-folder/followers_1.json",
    });
    Object.defineProperty(followerTwo, "webkitRelativePath", {
      value: "my-export/another-folder/followers_2.json",
    });
    Object.defineProperty(following, "webkitRelativePath", {
      value: "my-export/deeply/nested/following.json",
    });

    const result = await parseInstagramExport([
      followerOne,
      followerTwo,
      following,
      unrelated,
    ]);

    expect(result.followers.usernames).toEqual(["alice", "bob"]);
    expect(result.following.usernames).toEqual(["bob", "charlie"]);
    expect(result.totalFilesScanned).toBe(4);
  });

  it("can identify renamed HTML files from their headings", async () => {
    const followers = new File(
      [
        '<html><head><title>Followers</title></head><body><a href="https://instagram.com/alice">alice</a></body></html>',
      ],
      "first-list.html",
      { type: "text/html" },
    );
    const following = new File(
      [
        '<html><body><h1>Following</h1><a href="https://instagram.com/bob">bob</a></body></html>',
      ],
      "second-list.html",
      { type: "text/html" },
    );

    const result = await parseInstagramExport([followers, following]);
    expect(result.followers.usernames).toEqual(["alice"]);
    expect(result.following.usernames).toEqual(["bob"]);
  });
});

describe("list comparison", () => {
  it("separates one-way relationships and mutuals", () => {
    expect(
      compareLists(["alice", "bob", "dana"], ["bob", "charlie", "dana"]),
    ).toEqual({
      all: ["alice", "bob", "charlie", "dana"],
      notFollowingBack: ["charlie"],
      youDoNotFollow: ["alice"],
      mutuals: ["bob", "dana"],
    });
  });
});
