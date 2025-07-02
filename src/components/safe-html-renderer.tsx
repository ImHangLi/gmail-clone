
export function SafeHtmlRenderer({ html }: { html: string }) {
  return (
    <div className="h-full w-full">
      <iframe
        srcDoc={html}
        sandbox="allow-same-origin"
        className="h-full w-full border-none"
        style={{ minHeight: "480px" }}
      />
    </div>
  );
}
