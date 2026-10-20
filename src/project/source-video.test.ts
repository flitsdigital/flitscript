import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveHandle } from "../media/file-handles";
import { linkSourceVideo, readSourceVideo, sourceMismatches } from "./source-video";
import { updateProject } from "./store";

vi.mock("../media/probe", () => ({ probe: vi.fn(async () => ({ duration: 12 })) }));
vi.mock("./store", () => ({ updateProject: vi.fn(async () => {}) }));
vi.mock("../media/file-handles", () => ({ saveHandle: vi.fn(async () => {}) }));

const file = new File([new Uint8Array(64)], "clip.mov");
const handle = {} as FileSystemFileHandle;

beforeEach(() => vi.clearAllMocks());

describe("source video", () => {
  it("identifies a file and finds no mismatch against itself", async () => {
    const video = await readSourceVideo(file);
    expect(video.fingerprint).toMatchObject({ name: "clip.mov", size: 64, duration: 12 });
    expect(sourceMismatches(video.fingerprint, video)).toEqual([]);
  });

  it("records fingerprint and metadata unless the row already has them, and always keeps the handle", async () => {
    const video = await readSourceVideo(file);
    await linkSourceVideo("p1", video, handle);
    expect(updateProject).toHaveBeenCalledWith("p1", { fingerprint: video.fingerprint, video_meta: video.meta });
    vi.clearAllMocks();
    await linkSourceVideo("p1", video, handle, { recorded: true });
    expect(updateProject).not.toHaveBeenCalled();
    expect(saveHandle).toHaveBeenCalledWith("p1", handle);
  });
});
