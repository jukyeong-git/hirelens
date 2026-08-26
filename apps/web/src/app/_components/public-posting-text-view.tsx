import { parsePublicPostingText } from "./public-posting-text";

export function PublicPostingText({ value }: { value: string }) {
  return (
    <div className="formatted-public-text">
      {parsePublicPostingText(value).map((block, index) =>
        block.type === "paragraph" ? (
          <p key={String(index) + block.text}>{block.text}</p>
        ) : (
          <ul key={String(index) + block.items.join("|")}>
            {block.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
