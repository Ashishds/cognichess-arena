import "./globals.css";

export const metadata = {
  title: "CogniChess Arena — LLMs vs System-1",
  description: "CogniChess Arena: LLMs vs System-1 model playing chess powered by FastAPI & LangGraph",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
