const filters = document.querySelectorAll(".filter");
const cards = document.querySelectorAll(".project-card");
const signalTitle = document.querySelector("#signal-title");
const signalCopy = document.querySelector("#signal-copy");
const architectureTitle = document.querySelector("#architecture-title-panel");
const architectureProblem = document.querySelector("#architecture-problem");
const architectureLens = document.querySelector("#architecture-lens");
const architectureTradeoffs = document.querySelector("#architecture-tradeoffs");
const architectureProof = document.querySelector("#architecture-proof");

const signals = {
  leadership: {
    title: "Leadership Signal",
    copy:
      "Team execution matters as much as architecture: mentoring, code review, delivery planning, product partnership, and production ownership all stay connected."
  },
  platform: {
    title: "Platform Signal",
    copy:
      "The common thread is durable platform work: APIs, asynchronous processing, CI/CD, Kubernetes, Helm, observability, and operational support."
  },
  data: {
    title: "Data Signal",
    copy:
      "Reporting, ETL, ClickHouse, SQL tuning, and tenant-scale analytics work show the ability to move from operational data to reliable business insight."
  },
  ai: {
    title: "AI Signal",
    copy:
      "AI work is framed as production workflow design: OCR, LLM extraction, validation, APIs, and practical automation around business documents."
  },
  reporting: {
    title: "Enterprise Reporting Platform",
    copy:
      "A reporting platform with reusable components, stakeholder alignment, budget ownership, production support, and daily reporting scale."
  },
  clickhouse: {
    title: "ClickHouse Analytics Platform",
    copy:
      "A tenant-scale analytics platform focused on ingestion, schema design, query performance, and high-volume reporting modernization."
  },
  "ai-reporting": {
    title: "AI Reporting Platform",
    copy:
      "A document processing workflow using OCR and LLMs to extract, validate, and structure information from large file batches."
  },
  "file-platform": {
    title: "Enterprise File Platform",
    copy:
      "A secure file workflow platform using REST APIs, SFTP integration, background processing, and asynchronous delivery patterns."
  }
};

const architectureScenarios = {
  reporting: {
    title: "High-volume reporting",
    problem: "Many users need reliable, repeatable reports from operational data.",
    lens: "Separate reusable report definition, execution, delivery, and observability concerns.",
    tradeoffs:
      "Balance flexibility with supportability, and prefer predictable operations over clever one-off logic.",
    proof: "Platform thinking, reliability ownership, stakeholder alignment, and production delivery."
  },
  "ai-documents": {
    title: "AI document processing",
    problem: "Unstructured documents need to become useful structured data without losing validation discipline.",
    lens: "Treat AI as one step in a workflow: ingestion, OCR, extraction, validation, review, and monitoring.",
    tradeoffs:
      "Balance automation with confidence checks, human review paths, and clear handling for uncertain output.",
    proof: "Practical AI judgment, backend workflow design, and comfort operating in ambiguous technical spaces."
  },
  "secure-files": {
    title: "Secure file workflows",
    problem: "Enterprise users need controlled file movement, integration, and background processing.",
    lens: "Design around access control, API boundaries, asynchronous processing, auditability, and failure recovery.",
    tradeoffs:
      "Balance user convenience with security, operational visibility, and predictable transfer behavior.",
    proof: "Security-aware platform design, asynchronous architecture, and enterprise integration thinking."
  },
  "tenant-analytics": {
    title: "Tenant-scale analytics",
    problem: "Analytical workloads need to scale across tenants while staying queryable and maintainable.",
    lens: "Separate ingestion, storage layout, query patterns, and operational tuning decisions.",
    tradeoffs:
      "Balance query speed, data freshness, isolation, cost, and schema evolution.",
    proof: "Data platform design, analytical modeling, and performance-minded engineering."
  },
  "cloud-delivery": {
    title: "Cloud delivery",
    problem: "Teams need repeatable deployments that are understandable, observable, and recoverable.",
    lens: "Use CI/CD, containerization, Kubernetes, Helm, and environment discipline to reduce release risk.",
    tradeoffs:
      "Balance automation with clear rollback paths, configuration control, and operational simplicity.",
    proof: "Cloud-native delivery judgment, Infrastructure as Code experience, and production ownership."
  }
};

function emitPortfolioEvent(name, detail = {}) {
  window.dispatchEvent(new CustomEvent("portfolio:event", { detail: { name, ...detail } }));
}

filters.forEach((button) => {
  button.addEventListener("click", () => {
    const filter = button.dataset.filter;

    filters.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");

    cards.forEach((card) => {
      const tags = card.dataset.tags.split(" ");
      const shouldShow = filter === "all" || tags.includes(filter);
      card.classList.toggle("is-hidden", !shouldShow);
    });

    emitPortfolioEvent("project_filter", { filter });
  });
});

document.querySelectorAll("[data-signal]").forEach((button) => {
  button.addEventListener("click", () => {
    const signal = signals[button.dataset.signal];
    if (!signal || !signalTitle || !signalCopy) return;

    signalTitle.textContent = signal.title;
    signalCopy.textContent = signal.copy;
    emitPortfolioEvent("signal_opened", { signal: button.dataset.signal });
  });
});

document.querySelectorAll("[data-architecture]").forEach((button) => {
  button.addEventListener("click", () => {
    const scenario = architectureScenarios[button.dataset.architecture];
    if (!scenario || !architectureTitle || !architectureProblem || !architectureLens || !architectureTradeoffs || !architectureProof) {
      return;
    }

    document.querySelectorAll("[data-architecture]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    architectureTitle.textContent = scenario.title;
    architectureProblem.textContent = scenario.problem;
    architectureLens.textContent = scenario.lens;
    architectureTradeoffs.textContent = scenario.tradeoffs;
    architectureProof.textContent = scenario.proof;
    emitPortfolioEvent("architecture_scenario_opened", { value: button.dataset.architecture });
  });
});

const chatForm = document.querySelector("[data-chat-form]");
const contactForm = document.querySelector("[data-contact-form]");
const chatLog = document.querySelector("[data-chat-log]");
const chatStatus = document.querySelector("[data-chat-status]");
const contactStatus = document.querySelector("[data-contact-status]");
const chatHistory = [];

function appendChatMessage(role, content) {
  if (!chatLog) return;
  const wrapper = document.createElement("div");
  wrapper.className = `chat-message ${role}`;

  const label = document.createElement("strong");
  label.textContent = role === "user" ? "Recruiter" : "Assistant";
  const text = document.createElement("p");
  text.textContent = content;

  wrapper.append(label, text);
  chatLog.appendChild(wrapper);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function setChatStatus(message) {
  if (chatStatus) chatStatus.textContent = message || "";
}

function compactHistory() {
  return chatHistory.slice(-6);
}

async function askAssistant(message, storeTranscript) {
  const trimmed = message.trim();
  if (!trimmed) return;

  appendChatMessage("user", trimmed);
  chatHistory.push({ role: "user", content: trimmed });
  setChatStatus("Checking the public profile...");
  emitPortfolioEvent("chat_message_sent", { value: storeTranscript ? "stored" : "unstored" });

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: trimmed,
        page: "portfolio",
        history: compactHistory(),
        storeTranscript,
        consent: storeTranscript
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "The assistant is unavailable.");
    }

    appendChatMessage("assistant", payload.answer);
    chatHistory.push({ role: "assistant", content: payload.answer });
    setChatStatus("");

    if (contactForm && chatHistory.length >= 4) {
      contactForm.hidden = false;
    }
  } catch (error) {
    const messageText =
      error.message ||
      "The portfolio assistant is unavailable right now. You can still review the public resume or connect with Rodrigue on LinkedIn.";
    appendChatMessage("assistant", messageText);
    setChatStatus(messageText);
  }
}

document.querySelectorAll("[data-chat-question]").forEach((button) => {
  button.addEventListener("click", () => {
    const question = button.dataset.chatQuestion;
    emitPortfolioEvent("guided_question_selected", { value: question });
    askAssistant(question, false);
  });
});

if (chatForm) {
  chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(chatForm);
    const message = String(formData.get("message") || "");
    const storeTranscript = formData.get("storeTranscript") === "on";
    chatForm.reset();
    askAssistant(message, storeTranscript);
  });
}

if (contactForm) {
  contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(contactForm);
    const body = {
      name: String(formData.get("name") || ""),
      email: String(formData.get("email") || ""),
      message: String(formData.get("message") || ""),
      companyWebsite: String(formData.get("companyWebsite") || ""),
      consent: formData.get("consent") === "on"
    };

    if (contactStatus) contactStatus.textContent = "Sending contact details...";

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Contact capture failed.");

      contactForm.reset();
      contactForm.hidden = true;
      appendChatMessage("assistant", "Thanks. Your contact details were saved for Rodrigue to review.");
      emitPortfolioEvent("contact_captured");
    } catch (error) {
      if (contactStatus) {
        contactStatus.textContent =
          error.message ||
          "Contact capture is unavailable right now. Please connect with Rodrigue on LinkedIn instead.";
      }
    }
  });
}
