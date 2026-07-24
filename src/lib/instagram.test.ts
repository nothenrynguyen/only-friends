import { describe, expect, it } from "vitest";
import {
  compareLists,
  discoverImportFiles,
  discoverInstagramExport,
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
      <a href="https://instagram.com/accounts/login/">Log in</a>
      <a href="https://instagram.com/__deleted__abc123/">Deleted account</a>
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

  it("automatically combines standard split follower files", () => {
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

    const result = discoverImportFiles([
      followerOne,
      followerTwo,
      following,
      unrelated,
    ], "followers");

    expect(result.automaticFiles).toEqual([followerOne, followerTwo]);
    expect(result.candidates).toEqual([]);
  });

  it("finds both lists in one followers_and_following folder and ignores the rest", () => {
    const followers = new File(
      [JSON.stringify([relationship("alice")])],
      "followers_1.json",
      { type: "application/json" },
    );
    const following = new File(
      [JSON.stringify({ relationships_following: [relationship("bob")] })],
      "following.json",
      { type: "application/json" },
    );
    const recentlyUnfollowed = new File(
      [JSON.stringify([relationship("charlie")])],
      "recently_unfollowed_accounts.json",
      { type: "application/json" },
    );

    const result = discoverInstagramExport([
      recentlyUnfollowed,
      following,
      followers,
    ]);

    expect(result.followers.automaticFiles).toEqual([followers]);
    expect(result.following.automaticFiles).toEqual([following]);
  });

  it("asks the user when a folder has multiple ambiguous files", () => {
    const first = new File(
      [
        '<html><head><title>Followers</title></head><body><a href="https://instagram.com/alice">alice</a></body></html>',
      ],
      "first-list.html",
      { type: "text/html" },
    );
    const second = new File(
      [
        '<html><body><h1>Following</h1><a href="https://instagram.com/bob">bob</a></body></html>',
      ],
      "second-list.html",
      { type: "text/html" },
    );

    const result = discoverImportFiles([second, first], "followers");
    expect(result.automaticFiles).toEqual([]);
    expect(result.candidates).toEqual([first, second]);
  });

  it("uses a lone renamed HTML file without making the user find it", () => {
    const renamed = new File(
      ['<a href="https://instagram.com/alice">alice</a>'],
      "my-list.html",
      { type: "text/html" },
    );

    expect(discoverImportFiles([renamed], "following")).toEqual({
      automaticFiles: [renamed],
      candidates: [],
    });
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
