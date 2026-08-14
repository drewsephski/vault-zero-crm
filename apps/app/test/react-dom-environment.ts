type TestAttribute = { name: string; value: string };

class TestNode {
	readonly nodeType: number;
	ownerDocument: TestDocument;
	parentNode: TestNode | null = null;
	childNodes: TestNode[] = [];

	constructor(nodeType: number, ownerDocument: TestDocument) {
		this.nodeType = nodeType;
		this.ownerDocument = ownerDocument;
	}

	get firstChild(): TestNode | null {
		return this.childNodes[0] ?? null;
	}

	get lastChild(): TestNode | null {
		return this.childNodes.at(-1) ?? null;
	}

	get nextSibling(): TestNode | null {
		if (!this.parentNode) return null;
		const index = this.parentNode.childNodes.indexOf(this);
		return this.parentNode.childNodes[index + 1] ?? null;
	}

	get previousSibling(): TestNode | null {
		if (!this.parentNode) return null;
		const index = this.parentNode.childNodes.indexOf(this);
		return this.parentNode.childNodes[index - 1] ?? null;
	}

	get textContent(): string {
		return this.childNodes.map((child) => child.textContent).join("");
	}

	set textContent(value: string) {
		this.childNodes = [];
		if (value) this.appendChild(this.ownerDocument.createTextNode(value));
	}

	appendChild(child: TestNode): TestNode {
		child.parentNode = this;
		this.childNodes.push(child);
		return child;
	}

	insertBefore(child: TestNode, before: TestNode): TestNode {
		child.parentNode = this;
		const index = this.childNodes.indexOf(before);
		this.childNodes.splice(
			index < 0 ? this.childNodes.length : index,
			0,
			child,
		);
		return child;
	}

	removeChild(child: TestNode): TestNode {
		const index = this.childNodes.indexOf(child);
		if (index >= 0) this.childNodes.splice(index, 1);
		child.parentNode = null;
		return child;
	}

	addEventListener(): void {}

	removeEventListener(): void {}
}

class TestText extends TestNode {
	nodeValue: string;

	constructor(value: string, ownerDocument: TestDocument) {
		super(3, ownerDocument);
		this.nodeValue = value;
	}

	get data(): string {
		return this.nodeValue;
	}

	set data(value: string) {
		this.nodeValue = value;
	}

	get textContent(): string {
		return this.nodeValue;
	}

	set textContent(value: string) {
		this.nodeValue = value;
	}
}

class TestElement extends TestNode {
	readonly nodeName: string;
	readonly tagName: string;
	readonly namespaceURI = "http://www.w3.org/1999/xhtml";
	attributes: TestAttribute[] = [];
	style = {};

	constructor(name: string, ownerDocument: TestDocument) {
		super(1, ownerDocument);
		this.nodeName = name.toUpperCase();
		this.tagName = this.nodeName;
	}

	get textContent(): string {
		return this.childNodes.map((child) => child.textContent).join("");
	}

	set textContent(value: string) {
		this.childNodes = [];
		if (value) this.appendChild(this.ownerDocument.createTextNode(value));
	}

	setAttribute(name: string, value: string): void {
		const current = this.attributes.find(
			(attribute) => attribute.name === name,
		);
		if (current) current.value = String(value);
		else this.attributes.push({ name, value: String(value) });
	}

	getAttribute(name: string): string | null {
		return (
			this.attributes.find((attribute) => attribute.name === name)?.value ??
			null
		);
	}

	removeAttribute(name: string): void {
		this.attributes = this.attributes.filter(
			(attribute) => attribute.name !== name,
		);
	}

	hasAttribute(name: string): boolean {
		return this.attributes.some((attribute) => attribute.name === name);
	}
}

class TestDocument extends TestNode {
	readonly nodeName = "#document";
	readonly documentElement: TestElement;
	readonly body: TestElement;
	activeElement: TestElement;
	defaultView: object | null = null;

	constructor() {
		super(9, undefined as unknown as TestDocument);
		this.ownerDocument = this;
		this.documentElement = this.createElement("html");
		this.body = this.createElement("body");
		this.documentElement.appendChild(this.body);
		this.appendChild(this.documentElement);
		this.activeElement = this.body;
	}

	createElement(name: string): TestElement {
		return new TestElement(name, this);
	}

	createElementNS(_namespace: string, name: string): TestElement {
		return this.createElement(name);
	}

	createTextNode(value: string): TestText {
		return new TestText(value, this);
	}
}

const GLOBAL_KEYS = [
	"document",
	"window",
	"navigator",
	"IS_REACT_ACT_ENVIRONMENT",
] as const;

export function createHydrationEnvironment(
	tagName: string,
	serverText: string,
) {
	const descriptors = new Map(
		GLOBAL_KEYS.map((key) => [
			key,
			Object.getOwnPropertyDescriptor(globalThis, key),
		]),
	);
	const document = new TestDocument();
	const window = {
		document,
		event: undefined,
		HTMLElement: TestElement,
		HTMLIFrameElement: class extends TestElement {},
		Node: TestNode,
	};
	document.defaultView = window;
	Reflect.set(globalThis, "document", document);
	Reflect.set(globalThis, "window", window);
	Reflect.set(globalThis, "navigator", { userAgent: "test" });
	Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
	const container = document.createElement("div");
	const content = document.createElement(tagName);
	content.textContent = serverText;
	container.appendChild(content);
	document.body.appendChild(container);

	return {
		container,
		restore() {
			for (const key of GLOBAL_KEYS) {
				const descriptor = descriptors.get(key);
				if (descriptor) Object.defineProperty(globalThis, key, descriptor);
				else Reflect.deleteProperty(globalThis, key);
			}
		},
	};
}
