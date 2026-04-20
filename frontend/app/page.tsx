import Link from "next/link";

export default function Home() {
    return (
        <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
            <h1>CliniFlow AI</h1>
            <p>Pre-visit → Visit → Post-visit clinical workflow.</p>
            <ul>
                <li><Link href="/login">Sign in</Link></li>
                <li><Link href="/previsit/new">Start pre-visit intake (requires login)</Link></li>
            </ul>
        </main>
    );
}
