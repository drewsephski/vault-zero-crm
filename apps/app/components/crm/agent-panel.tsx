"use client";

import Checkmark from "@carbon/icons-react/es/Checkmark";
import CircleDash from "@carbon/icons-react/es/CircleDash";
import Document from "@carbon/icons-react/es/Document";
import LogoGithub from "@carbon/icons-react/es/LogoGithub";
import LogoLinkedin from "@carbon/icons-react/es/LogoLinkedin";
import Send from "@carbon/icons-react/es/Send";
import Warning from "@carbon/icons-react/es/Warning";
import {
	Attachment,
	AttachmentContent,
	AttachmentGroup,
	AttachmentMedia,
	AttachmentTitle,
	AttachmentTrigger,
} from "@crm/ui/components/attachment";
import { Bubble, BubbleContent } from "@crm/ui/components/bubble";
import { Button } from "@crm/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@crm/ui/components/empty";
import { Field, FieldLabel } from "@crm/ui/components/field";
import { type CarbonIcon, Icon } from "@crm/ui/components/icon";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
	InputGroupTextarea,
} from "@crm/ui/components/input-group";
import Logo from "@crm/ui/components/logo";
import { Markdown } from "@crm/ui/components/markdown";
import { Marker, MarkerContent, MarkerIcon } from "@crm/ui/components/marker";
import {
	Message,
	MessageAvatar,
	MessageContent,
} from "@crm/ui/components/message";
import {
	MessageScroller,
	MessageScrollerButton,
	MessageScrollerContent,
	MessageScrollerItem,
	MessageScrollerProvider,
	MessageScrollerViewport,
} from "@crm/ui/components/message-scroller";
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEveAgent } from "eve/react";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import {
	type Conversation,
	ConversationPicker,
	useConversations,
} from "@/components/crm/agent-conversations";
import { followUpPrompts } from "@/lib/agent-follow-up";
import {
	type AgentRecord,
	type AgentScope,
	recordCopy,
	recordFilter,
	recordHeader,
} from "@/lib/agent-record";
import {
	composerState,
	eventsOf,
	loadThread,
	offlineThread,
	type Thread as ThreadState,
} from "@/lib/agent-session";
import type { TranscriptMessage } from "@/lib/agent-transcript";
import {
	NEW_THREAD,
	pendingLinkedInFallback,
	pendingQuestion,
	resolveThread,
	type Source,
	type Tone,
	type TranscriptItem,
	toTranscript,
} from "@/lib/agent-transcript";
import { useTRPC } from "@/lib/trpc/client";
import { useRecordSheetView } from "./record-sheet/record-stack";

export function AgentPanel({ record }: { record: AgentRecord }) {
	const { thread, setThread } = useRecordSheetView("overview");

	return (
		<AgentChat scope={record} thread={thread} onThreadChange={setThread} />
	);
}

export function AgentChat({
	scope,
	thread,
	onThreadChange,
}: {
	scope: AgentScope;
	thread: string | null;
	onThreadChange: (thread: string | null) => void;
}) {
	const conversations = useConversations(recordFilter(scope));
	const [busy, setBusy] = useState(false);

	const history = conversations.data ?? [];

	const landedOn = useRef<string | null>(null);
	if (landedOn.current === null && conversations.isSuccess) {
		landedOn.current = history[0]?.id ?? NEW_THREAD;
	}

	const { openId, current } = resolveThread({
		conversations: history,
		fromUrl: thread,
		landedOn: landedOn.current,
	});

	if (conversations.isPending) return <Loading />;

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<ConversationPicker
				conversations={history}
				current={current}
				onSelect={(conversation) => {
					setBusy(false);
					onThreadChange(conversation.id);
				}}
				onNew={() => {
					setBusy(false);
					onThreadChange(NEW_THREAD);
				}}
				busy={busy}
			/>

			<ThreadWithHistory
				key={openId ?? NEW_THREAD}
				scope={scope}
				conversation={current}
				onNewThread={() => onThreadChange(NEW_THREAD)}
				onBusyChange={setBusy}
			/>
		</div>
	);
}

const WORKING_POLL_MS = 3000;
const SETTLED_TTL_MS = 60_000;

function ThreadWithHistory({
	scope,
	conversation,
	onNewThread,
	onBusyChange,
}: {
	scope: AgentScope;
	conversation: Conversation | null;
	onNewThread: () => void;
	onBusyChange: (busy: boolean) => void;
}) {
	const trpc = useTRPC();

	const thread = useQuery<ThreadState>({
		queryKey: ["agent-thread", conversation?.sessionId],
		enabled: conversation !== null,
		staleTime: SETTLED_TTL_MS,
		refetchOnWindowFocus: false,
		refetchInterval: (query) =>
			query.state.data?.status === "working" ? WORKING_POLL_MS : false,
		queryFn: ({ signal }) =>
			loadThread(conversation?.sessionId ?? "", recordHeader(scope), signal),
	});

	const offline = thread.data?.status === "offline";

	const archive = useQuery({
		...trpc.conversations.events.queryOptions({ id: conversation?.id ?? "" }),
		enabled: conversation !== null && offline,
		staleTime: SETTLED_TTL_MS,
	});

	if (conversation && (thread.isPending || (offline && archive.isPending)))
		return <Loading />;

	return (
		<Thread
			key={thread.data?.status === "working" ? "working" : "settled"}
			scope={scope}
			conversation={conversation}
			thread={
				offline ? offlineThread((archive.data ?? []) as never) : thread.data
			}
			onNewThread={onNewThread}
			onBusyChange={onBusyChange}
		/>
	);
}

function Loading() {
	return (
		<div className="flex flex-1 items-center justify-center">
			<Spinner />
		</div>
	);
}

function Thread({
	scope,
	conversation,
	thread,
	onNewThread,
	onBusyChange,
}: {
	scope: AgentScope;
	conversation: Conversation | null;
	thread: ThreadState | undefined;
	onNewThread: () => void;
	onBusyChange: (busy: boolean) => void;
}) {
	const copy = recordCopy(scope.kind);
	const agent = useEveAgent({
		headers: recordHeader(scope),
		...(thread && "session" in thread
			? { initialSession: thread.session, initialEvents: eventsOf(thread) }
			: { initialEvents: eventsOf(thread) }),
	});
	const [draft, setDraft] = useState("");

	const opening = useRef<string | null>(conversation?.title ?? null);

	useSavedConversation({
		scope: recordFilter(scope),
		conversation,
		opening,
		session: agent.session ?? null,
		messages: agent.data.messages.length,
	});

	const busy = agent.status === "submitted" || agent.status === "streaming";
	const working = busy || thread?.status === "working";
	const messages = toTranscript(agent.data.messages);
	const question = pendingQuestion(agent.data.messages);
	const linkedinFallback = pendingLinkedInFallback(agent.data.messages);
	const latestMessage = messages.at(-1);
	const hasStreamingText =
		working && latestMessage?.mine === false
			? latestMessage.items.some((item) => item.kind === "said")
			: false;

	const { locked, ended } = composerState(thread, busy);

	useEffect(() => {
		onBusyChange(working);
	}, [onBusyChange, working]);

	const ask = (message: string) => {
		if (!message.trim() || locked) return;
		opening.current ||= message.trim();
		setDraft("");
		void agent.send({ message: message.trim() });
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<MessageScrollerProvider autoScroll defaultScrollPosition="end">
				<MessageScroller className="flex-1">
					<MessageScrollerViewport>
						<MessageScrollerContent className="mx-auto w-full max-w-4xl gap-6 px-4 py-6 sm:px-6">
							{messages.length === 0 && !busy ? (
								<Idle kind={scope.kind} onAsk={ask} />
							) : null}

							{messages.map((message) => (
								<MessageScrollerItem key={message.id} messageId={message.id}>
									<div className="space-y-4">
										{message.items.map((item) => (
											<Item
												key={item.id}
												item={item}
												streaming={
													working &&
													message.id === latestMessage?.id &&
													!message.mine &&
													item.kind === "said" &&
													hasStreamingText
												}
											/>
										))}
									</div>
								</MessageScrollerItem>
							))}

							{working && !hasStreamingText ? (
								<MessageScrollerItem messageId="agent-working">
									<WorkingState />
								</MessageScrollerItem>
							) : null}

							{question ? (
								<MessageScrollerItem messageId={question.requestId}>
									<Question question={question} agent={agent} />
								</MessageScrollerItem>
							) : null}

							{linkedinFallback && !question && !working ? (
								<MessageScrollerItem messageId="linkedin-fallback">
									<LinkedInFallback fallback={linkedinFallback} agent={agent} />
								</MessageScrollerItem>
							) : null}

							{!working && !question && !linkedinFallback && !ended ? (
								<FollowUpPrompts
									kind={scope.kind}
									messages={messages}
									disabled={locked}
									onAsk={ask}
								/>
							) : null}
						</MessageScrollerContent>
					</MessageScrollerViewport>

					<MessageScrollerButton />
				</MessageScroller>
			</MessageScrollerProvider>

			{agent.error ? <Failure message={agent.error.message} /> : null}

			{thread?.status === "working" && !busy ? (
				<p className="border-t px-5 py-2 text-muted-foreground text-xs">
					Still working on the last question. Your next one can go in when it
					finishes.
				</p>
			) : null}

			{ended ? (
				<div className="flex items-center justify-between gap-3 border-t px-5 py-2">
					<p className="text-muted-foreground text-xs">
						This conversation has ended.
					</p>
					<Button variant="outline" size="sm" onClick={onNewThread}>
						Start a new conversation
					</Button>
				</div>
			) : null}

			<form
				className="mx-auto w-full max-w-4xl border-t px-4 py-4 sm:px-6"
				onSubmit={(event) => {
					event.preventDefault();
					ask(draft);
				}}
			>
				<InputGroup>
					<InputGroupTextarea
						aria-label={copy.placeholder}
						disabled={locked}
						maxLength={4000}
						onChange={(event) => setDraft(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && !event.shiftKey) {
								event.preventDefault();
								event.currentTarget.form?.requestSubmit();
							}
						}}
						placeholder={copy.placeholder}
						value={draft}
					/>
					<InputGroupAddon align="inline-end">
						<InputGroupButton
							aria-label="Ask the agent"
							disabled={locked || !draft.trim()}
							size="icon-sm"
							type="submit"
							variant="default"
						>
							{busy ? <Spinner /> : <Icon icon={Send} />}
						</InputGroupButton>
					</InputGroupAddon>
				</InputGroup>
				<p className="mt-2 text-muted-foreground text-[11px]">
					Press Enter to send · Shift + Enter for a new line
				</p>
			</form>
		</div>
	);
}

function FollowUpPrompts({
	kind,
	messages,
	disabled,
	onAsk,
}: {
	kind: AgentScope["kind"];
	messages: readonly TranscriptMessage[];
	disabled: boolean;
	onAsk: (prompt: string) => void;
}) {
	const prompts = followUpPrompts({ kind, messages });
	if (prompts.length === 0) return null;

	return (
		<MessageScrollerItem messageId="follow-up-prompts">
			<div className="space-y-2 pt-2">
				<p className="text-muted-foreground text-[11px]">Continue with</p>
				<div className="flex flex-wrap gap-2">
					{prompts.map((prompt) => (
						<Button
							disabled={disabled}
							key={prompt}
							variant="outline"
							size="sm"
							onClick={() => onAsk(prompt)}
						>
							{prompt}
						</Button>
					))}
				</div>
			</div>
		</MessageScrollerItem>
	);
}

function Idle({
	kind,
	onAsk,
}: {
	kind: AgentScope["kind"];
	onAsk: (question: string) => void;
}) {
	const copy = recordCopy(kind);

	return (
		<Empty className="min-h-full border-0 py-16" width="wide">
			<EmptyHeader>
				<EmptyMedia>
					<span className="flex size-8 items-center justify-center bg-foreground text-background">
						<Logo className="size-4" />
					</span>
				</EmptyMedia>
				<EmptyTitle>{copy.title}</EmptyTitle>
				<EmptyDescription>{copy.blurb}</EmptyDescription>
			</EmptyHeader>

			<EmptyContent layout="grid">
				{copy.suggestions.map((suggestion) => (
					<Button
						key={suggestion}
						variant="outline"
						size="sm"
						onClick={() => onAsk(suggestion)}
					>
						{suggestion}
					</Button>
				))}
			</EmptyContent>
		</Empty>
	);
}

function Failure({ message }: { message: string }) {
	const hint = message.includes("not reachable")
		? "Start it with `bun run dev`, or check AGENT_URL."
		: message.includes("not configured")
			? "Set AGENT_BRIDGE_SECRET for both the app and the agent."
			: null;

	return (
		<div className="border-t px-5 py-3 text-xs">
			<p className="text-destructive">{message}</p>
			{hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
		</div>
	);
}

const TONE_ICONS: Record<Tone, CarbonIcon> = {
	neutral: CircleDash,
	success: Checkmark,
	warning: Warning,
};

const SOURCE_ICONS: Record<Source["network"], CarbonIcon> = {
	linkedin: LogoLinkedin,
	github: LogoGithub,
	web: Document,
};

function Item({
	item,
	streaming = false,
}: {
	item: TranscriptItem;
	streaming?: boolean;
}) {
	if (item.kind === "said") {
		return item.mine ? (
			<Message align="end">
				<MessageContent>
					<Bubble variant="secondary" align="end">
						<BubbleContent>{item.text}</BubbleContent>
					</Bubble>
				</MessageContent>
			</Message>
		) : (
			<Message>
				<AgentAvatar />
				<MessageContent>
					<Bubble variant="ghost">
						<BubbleContent>
							<div aria-live={streaming ? "polite" : undefined}>
								<Markdown>{item.text}</Markdown>
								{streaming ? (
									<span
										aria-hidden="true"
										className="ml-1 inline-block h-3.5 w-px translate-y-0.5 animate-pulse bg-primary align-middle"
									/>
								) : null}
							</div>
						</BubbleContent>
					</Bubble>
				</MessageContent>
			</Message>
		);
	}

	return (
		<div className="space-y-1.5">
			<Marker>
				<MarkerIcon>
					{item.pending ? <Spinner /> : <Icon icon={TONE_ICONS[item.tone]} />}
				</MarkerIcon>
				<MarkerContent>{item.label}</MarkerContent>
			</Marker>

			{item.sources.length > 0 ? <Sources sources={item.sources} /> : null}
		</div>
	);
}

function WorkingState() {
	return (
		<Message>
			<AgentAvatar />
			<MessageContent>
				<StatusIndicator busy label="Working through the request" size="sm" />
			</MessageContent>
		</Message>
	);
}

function Sources({ sources }: { sources: Source[] }) {
	return (
		<AttachmentGroup>
			{sources.map((source) => (
				<Attachment key={source.url} size="xs" state="done">
					<AttachmentMedia variant="icon">
						<Icon icon={SOURCE_ICONS[source.network]} />
					</AttachmentMedia>
					<AttachmentContent>
						<AttachmentTitle>{source.title}</AttachmentTitle>
					</AttachmentContent>

					<AttachmentTrigger asChild>
						<a href={source.url} target="_blank" rel="noreferrer noopener">
							<span className="sr-only">Open {source.title}</span>
						</a>
					</AttachmentTrigger>
				</Attachment>
			))}
		</AttachmentGroup>
	);
}

function AgentAvatar() {
	return (
		<MessageAvatar>
			<span className="flex size-7 items-center justify-center bg-foreground text-background">
				<Logo className="size-3.5" />
			</span>
		</MessageAvatar>
	);
}

function Question({
	question,
	agent,
}: {
	question: NonNullable<ReturnType<typeof pendingQuestion>>;
	agent: ReturnType<typeof useEveAgent>;
}) {
	const [value, setValue] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [submitted, setSubmitted] = useState(false);
	const inputId = useId();
	const freeform =
		question.allowFreeform === true || question.display === "text";
	const linkedin = question.prompt.toLowerCase().includes("linkedin");

	const answer = (response: { optionId?: string; text?: string }) => {
		setSubmitted(true);
		void agent.send({
			inputResponses: [{ requestId: question.requestId, ...response }],
		});
	};

	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const trimmed = value.trim();
		if (!trimmed) return;
		if (linkedin && !looksLikeLinkedinInput(trimmed)) {
			setError("Enter a linkedin.com/in profile URL or username.");
			return;
		}
		setError(null);
		answer({ text: trimmed });
	};

	return (
		<Message>
			<AgentAvatar />
			<MessageContent>
				<Bubble variant="tinted">
					<BubbleContent>{question.prompt}</BubbleContent>
				</Bubble>

				{freeform ? (
					<form className="space-y-2" onSubmit={submit}>
						{linkedin ? (
							<Field>
								<FieldLabel htmlFor={inputId}>LinkedIn profile</FieldLabel>
							</Field>
						) : null}
						<InputGroup aria-invalid={Boolean(error)}>
							<InputGroupInput
								aria-describedby={error ? `${inputId}-error` : undefined}
								aria-invalid={Boolean(error)}
								autoComplete="url"
								autoFocus
								disabled={submitted}
								id={inputId}
								inputMode="url"
								onChange={(event) => {
									setValue(event.target.value);
									if (error) setError(null);
								}}
								placeholder={
									linkedin ? "linkedin.com/in/username" : "Type your answer"
								}
								value={value}
							/>
							<InputGroupAddon align="inline-end">
								<InputGroupButton
									aria-label="Submit answer"
									disabled={submitted || !value.trim()}
									size="icon-sm"
									type="submit"
									variant="default"
								>
									{submitted ? <Spinner /> : <Icon icon={Send} />}
								</InputGroupButton>
							</InputGroupAddon>
						</InputGroup>
						{error ? (
							<p
								className="text-destructive text-xs"
								id={`${inputId}-error`}
								role="alert"
							>
								{error}
							</p>
						) : null}
					</form>
				) : null}

				<div className="flex flex-wrap gap-2">
					{(question.options ?? []).map((option) => (
						<Button
							disabled={submitted}
							key={option.id}
							variant="outline"
							size="sm"
							onClick={() => answer({ optionId: option.id })}
						>
							{option.label}
						</Button>
					))}
				</div>
			</MessageContent>
		</Message>
	);
}

function LinkedInFallback({
	fallback,
	agent,
}: {
	fallback: NonNullable<ReturnType<typeof pendingLinkedInFallback>>;
	agent: ReturnType<typeof useEveAgent>;
}) {
	const [value, setValue] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [submitted, setSubmitted] = useState(false);
	const inputId = useId();

	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const trimmed = value.trim();
		if (!trimmed) return;
		if (!looksLikeLinkedinInput(trimmed)) {
			setError("Enter a linkedin.com/in profile URL or username.");
			return;
		}

		setError(null);
		setSubmitted(true);
		void agent.send({
			message: `Use this LinkedIn profile to continue researching ${fallback.query}: ${trimmed}. Read it now, verify it against the name, and do not ask me for an email, company, or domain first.`,
		});
	};

	return (
		<Message>
			<AgentAvatar />
			<MessageContent>
				<Bubble variant="tinted">
					<BubbleContent>{fallback.prompt}</BubbleContent>
				</Bubble>

				<form className="space-y-2" onSubmit={submit}>
					<Field>
						<FieldLabel htmlFor={inputId}>LinkedIn profile</FieldLabel>
					</Field>
					<InputGroup aria-invalid={Boolean(error)}>
						<InputGroupInput
							aria-describedby={error ? `${inputId}-error` : undefined}
							aria-invalid={Boolean(error)}
							autoComplete="url"
							autoFocus
							disabled={submitted}
							id={inputId}
							inputMode="url"
							onChange={(event) => {
								setValue(event.target.value);
								if (error) setError(null);
							}}
							placeholder="linkedin.com/in/username"
							value={value}
						/>
						<InputGroupAddon align="inline-end">
							<InputGroupButton
								aria-label="Continue with LinkedIn profile"
								disabled={submitted || !value.trim()}
								size="icon-sm"
								type="submit"
								variant="default"
							>
								{submitted ? <Spinner /> : <Icon icon={Send} />}
							</InputGroupButton>
						</InputGroupAddon>
					</InputGroup>
					{error ? (
						<p
							className="text-destructive text-xs"
							id={`${inputId}-error`}
							role="alert"
						>
							{error}
						</p>
					) : null}
				</form>
			</MessageContent>
		</Message>
	);
}

function looksLikeLinkedinInput(value: string): boolean {
	if (/^[A-Za-z0-9][A-Za-z0-9_%-]{2,100}$/.test(value)) return true;

	try {
		const url = new URL(value.includes("://") ? value : `https://${value}`);
		return (
			(url.hostname === "linkedin.com" ||
				url.hostname.endsWith(".linkedin.com")) &&
			/^\/in\/[A-Za-z0-9_%-]+\/?$/.test(url.pathname)
		);
	} catch {
		return false;
	}
}

function useSavedConversation({
	scope,
	conversation,
	opening,
	session,
	messages,
}: {
	scope: {
		scope?: "workspace";
		contactId?: string;
		companyId?: string;
		dealId?: string;
	};
	conversation: Conversation | null;
	opening: React.RefObject<string | null>;
	session: {
		sessionId?: string;
		continuationToken?: string;
		streamIndex: number;
	} | null;
	messages: number;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const save = useMutation(trpc.conversations.save.mutationOptions({}));

	const sessionId = session?.sessionId ?? null;
	const token = session?.continuationToken ?? null;
	const streamIndex = session?.streamIndex ?? 0;
	const { scope: conversationScope, contactId, companyId, dealId } = scope;

	const isNew = conversation === null || conversation.sessionId !== sessionId;

	const latest = useRef({ save, queryClient, trpc, opening });
	latest.current = { save, queryClient, trpc, opening };

	const written = useRef<string | null>(null);

	useEffect(() => {
		if (!sessionId) return;

		const cursor = `${sessionId}:${token ?? ""}:${messages}`;
		if (written.current === cursor) return;
		written.current = cursor;

		const {
			save: mutation,
			queryClient: cache,
			trpc: api,
			opening: title,
		} = latest.current;

		mutation.mutate(
			{
				...(conversationScope ? { scope: conversationScope } : {}),
				...(contactId ? { contactId } : {}),
				...(companyId ? { companyId } : {}),
				...(dealId ? { dealId } : {}),
				sessionId,
				continuationToken: token,
				streamIndex,
				messageCount: messages,
				...(isNew ? { title: title.current ?? undefined } : {}),
			},
			{
				onSuccess: () => {
					if (!isNew) return;
					void cache.invalidateQueries({
						queryKey: api.conversations.list.pathKey(),
					});
				},
			},
		);
	}, [
		sessionId,
		token,
		streamIndex,
		messages,
		conversationScope,
		contactId,
		companyId,
		dealId,
		isNew,
	]);
}
