"use client";

import { cn } from "@crm/ui/lib/utils";
import { useState } from "react";
import { BentoCard, CardHeading } from "./bento-card";
import { SendArrow } from "./send-arrow";

const QUESTIONS = [
	"Why does this fit our buy box?",
	"What important facts are missing?",
	"What should we do next?",
];

const PLACEHOLDER = "Ask Eve about this target";

/**
 * The one card a reader can actually drive: picking a question loads it into
 * the composer. It goes no further on purpose — the answer needs a record, and
 * the homepage does not send anybody to a sign-in form to see one.
 */
export function AskCard() {
	const [asked, setAsked] = useState<string | null>(null);
	const [prompt, setPrompt] = useState("");
	const [answer, setAnswer] = useState("");
	const [isStreaming, setIsStreaming] = useState(false);

	async function askQuestion(question: string) {
		const trimmedQuestion = question.trim();
		if (!trimmedQuestion || isStreaming) return;

		setAsked(trimmedQuestion);
		setPrompt("");
		setAnswer("");
		setIsStreaming(true);

		try {
			const response = await fetch("/api/landing/ask", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ prompt: trimmedQuestion }),
			});
			if (!response.ok || !response.body) throw new Error("Unable to answer");

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				setAnswer(
					(current) => current + decoder.decode(value, { stream: true }),
				);
			}
		} catch {
			setAnswer("This demo is temporarily unavailable. Try another question.");
		} finally {
			setIsStreaming(false);
		}
	}

	return (
		<BentoCard className="grow gap-6">
			<CardHeading
				title="Ask any target a question"
				body="Eve reads the record, the evidence, and your buy box before answering."
			/>

			{(answer || isStreaming) && (
				<div className="flex grow flex-col justify-start">
					<div
						aria-live="polite"
						className="rounded-md bg-muted p-3 text-[13px]/[19px] text-muted-foreground"
					>
						{answer}
						{isStreaming && <span aria-hidden="true">▋</span>}
					</div>
				</div>
			)}

			{!asked && (
				<div className="flex grow flex-col justify-end gap-2.5">
					<p className="select-none font-medium text-[#5A5A5A] text-[11px]/4">
						SUGGESTED
					</p>
					{QUESTIONS.map((question) => (
						<button
							key={question}
							type="button"
							onClick={() => void askQuestion(question)}
							className={cn(
								"flex h-[38px] shrink-0 cursor-pointer select-none items-center rounded-md px-3 text-left text-[13px]/[18px] transition-colors bg-muted hover:bg-accent",
							)}
						>
							{question}
						</button>
					))}
				</div>
			)}

			<form
				onSubmit={(event) => {
					event.preventDefault();
					void askQuestion(prompt);
				}}
				className="flex h-11 shrink-0 items-center gap-2.5 rounded-md border border-border bg-[#1A1A1A] pr-1.5 pl-3.5 transition-colors focus-within:border-ring"
			>
				<input
					value={prompt}
					onChange={(event) => setPrompt(event.target.value)}
					placeholder={asked ?? PLACEHOLDER}
					disabled={isStreaming}
					aria-label="Ask Eve about this target"
					className="min-w-0 grow bg-transparent text-[13px]/[18px] text-foreground outline-none placeholder:text-[#6E6E6E]"
				/>
				<button
					type="submit"
					disabled={!prompt.trim() || isStreaming}
					aria-label="Send question"
					className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-primary disabled:cursor-not-allowed disabled:opacity-50"
				>
					<SendArrow className="size-3.5 text-primary-foreground" />
				</button>
			</form>
		</BentoCard>
	);
}
