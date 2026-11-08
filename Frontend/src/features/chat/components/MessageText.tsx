import Markdown from "react-markdown";

export function MessageText({ text }: { text: string }) {
  return <Markdown skipHtml disallowedElements={["img"]} components={{
    a: ({ href, title, children }) => <a href={href} title={title} target="_blank" rel="noopener noreferrer">{children}</a>,
  }}>{text}</Markdown>;
}
