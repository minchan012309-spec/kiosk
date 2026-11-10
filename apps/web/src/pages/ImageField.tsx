import { useEffect, useRef, useState } from "react";
import { cloud } from "../../../../packages/shared/src/cloud";

export async function uploadCatalogImage(file: File, kind: string) {
  if (
    file.size > 2097152 ||
    !["image/png", "image/jpeg", "image/webp"].includes(file.type)
  )
    throw Error("PNG/JPG/WebP 이미지 2MB 이하를 선택하세요.");
  const ext =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : "jpg";
  const path = `${kind}/${crypto.randomUUID()}.${ext}`;
  const { error } = await cloud.storage
    .from("club-media")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error)
    throw Error(
      "이미지 업로드 실패: " +
        error.message +
        " · 003 업데이트 SQL과 상품/게임 관리 권한을 확인하세요.",
    );
  return cloud.storage.from("club-media").getPublicUrl(path).data.publicUrl;
}
export function PreviewImage({
  url,
  fallback,
  className = "",
}: {
  url?: string;
  fallback: React.ReactNode;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return (
    <span className={`preview-image ${className}`}>
      {url && !failed ? (
        <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        fallback
      )}
    </span>
  );
}
export function ImageField({ initial = "" }: { initial?: string }) {
  const [url, setUrl] = useState(initial),
    [file, setFile] = useState<File>();
  const [preview, setPreview] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const local = URL.createObjectURL(file);
    setPreview(local);
    return () => URL.revokeObjectURL(local);
  }, [file]);
  useEffect(() => {
    const form = input.current?.form;
    const reset = () => {
      setFile(undefined);
      setUrl(initial);
    };
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [initial]);
  return (
    <div className="image-field">
      <label>
        미리보기 이미지 (PNG/JPG/WebP · 최대 2MB)
        <input
          type="file"
          name="imageFile"
          accept="image/png,image/jpeg,image/webp"
          ref={input}
          onChange={(e) => setFile(e.target.files?.[0])}
        />
      </label>
      <input type="hidden" name="imageUrl" value={url} />
      <PreviewImage
        url={preview || url}
        fallback="이미지 없음"
        className="editor-preview"
      />
      <button
        type="button"
        onClick={() => {
          setFile(undefined);
          setUrl("");
          if (input.current) input.current.value = "";
        }}
      >
        이미지 제거
      </button>
    </div>
  );
}
