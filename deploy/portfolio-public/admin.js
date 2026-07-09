const loginPanel = document.querySelector("[data-admin-login]");
const appPanel = document.querySelector("[data-admin-app]");
const loginForm = document.querySelector("[data-admin-login-form]");
const loginStatus = document.querySelector("[data-admin-login-status]");
const registerForm = document.querySelector("[data-admin-register-form]");
const registerStatus = document.querySelector("[data-admin-register-status]");
const ownerTools = document.querySelector("[data-owner-tools]");
const ownerOnlyNodes = document.querySelectorAll("[data-owner-only]");
const createInviteButton = document.querySelector("[data-create-invite]");
const inviteOutput = document.querySelector("[data-invite-output]");
const inviteStatus = document.querySelector("[data-invite-status]");
const dashboardStats = document.querySelector("[data-dashboard-stats]");
const refreshHealthButton = document.querySelector("[data-refresh-health]");
const healthOutput = document.querySelector("[data-health-output]");
const profileStatus = document.querySelector("[data-profile-status]");
const saveProfileButton = document.querySelector("[data-save-profile]");
const profileFields = {
  headline: document.querySelector("[data-profile-headline]"),
  summary: document.querySelector("[data-profile-summary]"),
  skills: document.querySelector("[data-profile-skills]"),
  experience: document.querySelector("[data-profile-experience]"),
  projects: document.querySelector("[data-profile-projects]"),
  metrics: document.querySelector("[data-profile-metrics]"),
  constraints: document.querySelector("[data-profile-constraints]")
};
const tailorForm = document.querySelector("[data-tailor-form]");
const tailorStatus = document.querySelector("[data-tailor-status]");
const trackerStatus = document.querySelector("[data-tracker-status]");
const output = document.querySelector("[data-tailor-output]");
const downloadButton = document.querySelector("[data-download-markdown]");
const clearButton = document.querySelector("[data-clear-output]");
const saveJobButton = document.querySelector("[data-save-job]");
const exportJobsButton = document.querySelector("[data-export-jobs]");
const importJobsInput = document.querySelector("[data-import-jobs]");
const jobList = document.querySelector("[data-job-list]");
const statusFilter = document.querySelector("[data-status-filter]");
const jobStatus = document.querySelector("[data-job-status]");
const jobUrl = document.querySelector("[data-job-url]");
const dateApplied = document.querySelector("[data-date-applied]");
const followUpDate = document.querySelector("[data-follow-up-date]");
const recruiterName = document.querySelector("[data-recruiter-name]");
const recruiterContact = document.querySelector("[data-recruiter-contact]");
const compNotes = document.querySelector("[data-comp-notes]");
const jobNotes = document.querySelector("[data-job-notes]");
const researchSources = document.querySelector("[data-research-sources]");
const webQuery = document.querySelector("[data-web-query]");
const webResearchButton = document.querySelector("[data-web-research]");
const generateResearchButton = document.querySelector("[data-generate-research]");
const generatePrepButton = document.querySelector("[data-generate-prep]");
const downloadJobButton = document.querySelector("[data-download-job-package]");
const downloadFullPackageButton = document.querySelector("[data-download-full-package]");
const deleteJobButton = document.querySelector("[data-delete-job]");

const STORAGE_PREFIX = "career_os_admin_jobs_v1";
let jobs = [];
let selectedJobId = "";
let currentUser = null;

function setText(node, value) {
  if (node) node.textContent = value || "";
}

function showApp() {
  if (loginPanel) loginPanel.hidden = true;
  if (appPanel) appPanel.hidden = false;
  if (ownerTools) ownerTools.hidden = currentUser?.role !== "owner";
  ownerOnlyNodes.forEach((node) => {
    node.hidden = currentUser?.role !== "owner";
  });
  loadJobs()
    .then(() => {
      renderJobs();
      fillJobDetail(selectedJob());
      renderDashboard();
    })
    .catch(() => {
      loadJobsFromLocal();
      renderJobs();
      fillJobDetail(selectedJob());
      renderDashboard();
      setText(trackerStatus, "Using local browser backup until the encrypted database is available.");
    });
  loadProfile().catch(() => {});
}

function showInviteRegistrationIfNeeded() {
  const inviteToken = new URLSearchParams(window.location.search).get("invite");
  if (!inviteToken || !registerForm) return;
  registerForm.hidden = false;
  registerForm.elements.inviteToken.value = inviteToken;
  setText(loginStatus, "Create your invited account, then your job tracker will be private to you.");
}

function currentUserId() {
  return currentUser?.userId || currentUser?.id || "owner";
}

function storageKey() {
  return `${STORAGE_PREFIX}_${currentUserId()}`;
}

function getTailorFormValues() {
  const formData = new FormData(tailorForm);
  return {
    company: String(formData.get("company") || "").trim(),
    role: String(formData.get("role") || "").trim(),
    jobDescription: String(formData.get("jobDescription") || "").trim()
  };
}

function getProfileValues() {
  return Object.fromEntries(
    Object.entries(profileFields).map(([key, node]) => [key, node ? String(node.value || "").trim() : ""])
  );
}

function setProfileValues(profile) {
  Object.entries(profileFields).forEach(([key, node]) => {
    if (node) node.value = profile?.[key] || "";
  });
}

async function loadProfile() {
  try {
    const response = await fetch("/api/admin?action=profile", { method: "GET" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Profile load failed.");
    setProfileValues(payload.profile || {});
    if (payload.profile) setText(profileStatus, "Loaded encrypted resume profile.");
  } catch (error) {
    setText(profileStatus, error.message || "Profile database is unavailable.");
  }
}

function setTailorFormValues(job) {
  if (!tailorForm || !job) return;
  tailorForm.elements.company.value = job.company || "";
  tailorForm.elements.role.value = job.role || "";
  tailorForm.elements.jobDescription.value = job.jobDescription || "";
}

function loadJobsFromLocal() {
  try {
    jobs = JSON.parse(localStorage.getItem(storageKey()) || "[]");
  } catch {
    jobs = [];
  }
}

async function loadJobs() {
  try {
    const response = await fetch("/api/admin?action=jobs", { method: "GET" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Database load failed.");
    jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
    localStorage.setItem(storageKey(), JSON.stringify(jobs));
    selectedJobId = jobs[0]?.id || "";
    setText(trackerStatus, "Loaded encrypted job database.");
  } catch (error) {
    loadJobsFromLocal();
    selectedJobId = jobs[0]?.id || "";
    setText(trackerStatus, error.message || "Using local browser backup until the database is available.");
  }
}

function persistJobs() {
  localStorage.setItem(storageKey(), JSON.stringify(jobs));
  return fetch("/api/admin?action=jobs", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jobs })
  })
    .then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Database save failed.");
      return true;
    })
    .catch((error) => {
      setText(
        trackerStatus,
        `${error.message || "Database save failed."} Local browser backup was still updated.`
      );
      return false;
    });
}

function selectedJob() {
  return jobs.find((job) => job.id === selectedJobId) || null;
}

function makeJobId() {
  return `job_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeJob(input, existing = {}) {
  const now = new Date().toISOString();
  return {
    id: existing.id || makeJobId(),
    company: input.company || existing.company || "Unknown Company",
    role: input.role || existing.role || "Unknown Role",
    jobDescription: input.jobDescription || existing.jobDescription || "",
    status: jobStatus?.value || existing.status || "Saved",
    jobUrl: jobUrl?.value || existing.jobUrl || "",
    dateSaved: existing.dateSaved || now,
    dateApplied: dateApplied?.value || existing.dateApplied || "",
    followUpDate: followUpDate?.value || existing.followUpDate || "",
    recruiterName: recruiterName?.value || existing.recruiterName || "",
    recruiterContact: recruiterContact?.value || existing.recruiterContact || "",
    compNotes: compNotes?.value || existing.compNotes || "",
    notes: jobNotes?.value || existing.notes || "",
    researchSources: researchSources?.value || existing.researchSources || "",
    webResearch: existing.webResearch || [],
    generatedPackage: output?.value || existing.generatedPackage || "",
    companyResearch: existing.companyResearch || "",
    interviewPrep: existing.interviewPrep || "",
    updatedAt: now
  };
}

function fillJobDetail(job) {
  if (!job) {
    if (jobStatus) jobStatus.value = "Saved";
    [
      jobUrl,
      dateApplied,
      followUpDate,
      recruiterName,
      recruiterContact,
      compNotes,
      jobNotes,
      researchSources
    ].forEach((node) => {
      if (node) node.value = "";
    });
    return;
  }

  setTailorFormValues(job);
  if (output) output.value = job.generatedPackage || "";
  if (downloadButton) downloadButton.disabled = !output?.value.trim();
  if (jobStatus) jobStatus.value = job.status || "Saved";
  if (jobUrl) jobUrl.value = job.jobUrl || "";
  if (dateApplied) dateApplied.value = job.dateApplied || "";
  if (followUpDate) followUpDate.value = job.followUpDate || "";
  if (recruiterName) recruiterName.value = job.recruiterName || "";
  if (recruiterContact) recruiterContact.value = job.recruiterContact || "";
  if (compNotes) compNotes.value = job.compNotes || "";
  if (jobNotes) jobNotes.value = job.notes || "";
  if (researchSources) researchSources.value = job.researchSources || "";
}

function renderJobs() {
  if (!jobList) return;
  const filter = statusFilter?.value || "all";
  const visible = jobs
    .filter((job) => filter === "all" || job.status === filter)
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));

  jobList.innerHTML = "";

  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "empty-list";
    empty.textContent = "No jobs saved yet.";
    jobList.appendChild(empty);
    return;
  }

  visible.forEach((job) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `job-item${job.id === selectedJobId ? " active" : ""}`;
    button.innerHTML = `<strong>${job.company}</strong><span>${job.role}</span><em>${job.status}</em>`;
    button.addEventListener("click", () => {
      selectedJobId = job.id;
      fillJobDetail(job);
      renderJobs();
      setText(trackerStatus, `Selected ${job.company} - ${job.role}.`);
    });
    jobList.appendChild(button);
  });
}

function renderDashboard() {
  if (!dashboardStats) return;
  const counts = jobs.reduce((acc, job) => {
    const status = job.status || "Saved";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const now = new Date();
  const upcoming = jobs.filter((job) => {
    if (!job.followUpDate) return false;
    const date = new Date(`${job.followUpDate}T00:00:00`);
    const days = (date - now) / (1000 * 60 * 60 * 24);
    return days >= -1 && days <= 7;
  }).length;
  const stale = jobs.filter((job) => {
    if (["Offer", "Rejected", "Archived"].includes(job.status)) return false;
    const updated = new Date(job.updatedAt || job.dateSaved || 0);
    return Number.isFinite(updated.getTime()) && now - updated > 14 * 24 * 60 * 60 * 1000;
  }).length;
  const researched = jobs.filter((job) => job.companyResearch || job.webResearch?.length).length;

  dashboardStats.innerHTML = "";
  [
    ["Total jobs", jobs.length],
    ["Upcoming follow-ups", upcoming],
    ["Stale active jobs", stale],
    ["With research", researched],
    ...Object.entries(counts).sort()
  ].forEach(([label, value]) => {
    const item = document.createElement("p");
    item.className = "dashboard-stat";
    item.innerHTML = `<strong>${value}</strong><span>${label}</span>`;
    dashboardStats.appendChild(item);
  });
}

function saveCurrentJob(statusOverride) {
  const values = getTailorFormValues();
  const existing = selectedJob();
  if (!values.company && !values.role && !values.jobDescription) {
    setText(trackerStatus, "Add company, role, or job description before saving.");
    return null;
  }

  if (statusOverride && jobStatus) jobStatus.value = statusOverride;
  const job = normalizeJob(values, existing || {});
  const index = jobs.findIndex((item) => item.id === job.id);
  if (index === -1) jobs.push(job);
  else jobs[index] = job;

  selectedJobId = job.id;
  persistJobs().then((savedRemote) => {
    if (savedRemote) setText(trackerStatus, `Saved ${job.company} - ${job.role} to encrypted database.`);
  });
  renderJobs();
  renderDashboard();
  setText(trackerStatus, `Saved ${job.company} - ${job.role}.`);
  return job;
}

function downloadFile(filename, text, type = "text/markdown;charset=utf-8") {
  const blob = new Blob([text], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

function safeSlug(value) {
  return String(value || "job")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function buildJobMarkdown(job) {
  return `# ${job.company} - ${job.role}

Status: ${job.status}
Job URL: ${job.jobUrl || ""}
Date saved: ${job.dateSaved || ""}
Date applied: ${job.dateApplied || ""}
Follow-up date: ${job.followUpDate || ""}
Recruiter/contact: ${job.recruiterName || ""} ${job.recruiterContact || ""}

## Compensation / Remote / Location Notes

${job.compNotes || ""}

## Application and Interview Notes

${job.notes || ""}

## Company and Interview Research Notes

${job.researchSources || ""}

## Web Research Sources

${(job.webResearch || [])
  .map((item) => `### ${item.query || "Research"}\n\n${item.markdown || ""}`)
  .join("\n\n")}

## Job Description

${job.jobDescription || ""}

## Generated Resume Package

${job.generatedPackage || ""}

## Company and Interview Research

${job.companyResearch || ""}

## Interview Prep

${job.interviewPrep || ""}
`;
}

function buildFullPackageMarkdown(job) {
  return `${buildJobMarkdown(job)}

## Export Metadata

Exported: ${new Date().toISOString()}
Account: ${currentUser?.email || "unknown"}
`;
}

function upsertMarkdownSection(text, heading, content) {
  const base = String(text || "").trim();
  const section = `## ${heading}\n\n${content || ""}`.trim();
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\n*## ${escapedHeading}\\n\\n[\\s\\S]*?(?=\\n## |$)`);
  if (pattern.test(base)) return base.replace(pattern, `\n\n${section}`).trim();
  return `${base}\n\n${section}`.trim();
}

function downloadMarkdown() {
  const text = output?.value || "";
  if (!text.trim()) return;
  const current = selectedJob();
  const stamp = new Date().toISOString().slice(0, 10);
  const prefix = current ? `${safeSlug(current.company)}_${safeSlug(current.role)}` : "tailored_resume_package";
  downloadFile(`${prefix}_${stamp}.md`, text);
}

async function checkSession() {
  const response = await fetch("/api/admin?action=me", { method: "GET" });
  if (response.status === 200) {
    const payload = await response.json().catch(() => ({}));
    currentUser = payload.user || null;
    showApp();
  }
}

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);
    setText(loginStatus, "Checking credentials...");

    try {
      const response = await fetch("/api/admin?action=login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: String(formData.get("email") || ""),
          password: String(formData.get("password") || ""),
          passcode: String(formData.get("passcode") || "")
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to unlock admin.");
      currentUser = payload.user || null;
      loginForm.reset();
      setText(loginStatus, "");
      showApp();
    } catch (error) {
      setText(loginStatus, error.message || "Unable to unlock admin.");
    }
  });
}

if (registerForm) {
  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(registerForm);
    setText(registerStatus, "Creating account...");

    try {
      const response = await fetch("/api/admin?action=register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          inviteToken: String(formData.get("inviteToken") || ""),
          email: String(formData.get("email") || ""),
          password: String(formData.get("password") || "")
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to create account.");
      currentUser = payload.user || null;
      registerForm.reset();
      setText(registerStatus, "");
      showApp();
    } catch (error) {
      setText(registerStatus, error.message || "Unable to create account.");
    }
  });
}

if (createInviteButton) {
  createInviteButton.addEventListener("click", async () => {
    setText(inviteStatus, "Creating invite...");
    if (inviteOutput) inviteOutput.value = "";

    try {
      const response = await fetch("/api/admin?action=invites", { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to create invite.");
      if (inviteOutput) {
        inviteOutput.value = payload.inviteUrl || payload.inviteToken || "";
        inviteOutput.select();
      }
      setText(inviteStatus, "Invite link created. Share it only with someone you trust.");
    } catch (error) {
      setText(inviteStatus, error.message || "Unable to create invite.");
    }
  });
}

if (tailorForm) {
  tailorForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = getTailorFormValues();

    setText(tailorStatus, "Generating tailored package...");
    if (downloadButton) downloadButton.disabled = true;

    try {
      const response = await fetch("/api/admin?action=tailor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Generation failed.");
      if (output) output.value = payload.markdown || "";
      if (downloadButton) downloadButton.disabled = !output?.value.trim();
      saveCurrentJob("Tailored");
      setText(tailorStatus, "Generated and saved to selected job. Review and edit before applying.");
    } catch (error) {
      setText(tailorStatus, error.message || "Generation failed.");
    }
  });
}

if (saveJobButton) saveJobButton.addEventListener("click", () => saveCurrentJob());
if (downloadButton) downloadButton.addEventListener("click", downloadMarkdown);
if (statusFilter) statusFilter.addEventListener("change", renderJobs);

if (downloadJobButton) {
  downloadJobButton.addEventListener("click", () => {
    const job = saveCurrentJob();
    if (!job) return;
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(`${safeSlug(job.company)}_${safeSlug(job.role)}_${stamp}_application.md`, buildJobMarkdown(job));
  });
}

if (downloadFullPackageButton) {
  downloadFullPackageButton.addEventListener("click", () => {
    const job = saveCurrentJob();
    if (!job) return;
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(`${safeSlug(job.company)}_${safeSlug(job.role)}_${stamp}_full_package.md`, buildFullPackageMarkdown(job));
  });
}

if (exportJobsButton) {
  exportJobsButton.addEventListener("click", () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(`career_os_jobs_${stamp}.json`, JSON.stringify(jobs, null, 2), "application/json;charset=utf-8");
  });
}

if (importJobsInput) {
  importJobsInput.addEventListener("change", async () => {
    const file = importJobsInput.files?.[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      if (!Array.isArray(imported)) throw new Error("Invalid jobs file.");
      jobs = imported;
      selectedJobId = jobs[0]?.id || "";
      fillJobDetail(selectedJob());
      renderJobs();
      renderDashboard();
      persistJobs();
      setText(trackerStatus, `Imported ${jobs.length} jobs.`);
    } catch (error) {
      setText(trackerStatus, error.message || "Import failed.");
    } finally {
      importJobsInput.value = "";
    }
  });
}

if (generateResearchButton) {
  generateResearchButton.addEventListener("click", async () => {
    const job = saveCurrentJob();
    if (!job) return;
    setText(trackerStatus, "Generating company and interview research...");

    try {
      const response = await fetch("/api/admin?action=research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          company: job.company,
          role: job.role,
          jobDescription: job.jobDescription,
          sourceNotes: job.researchSources,
          existingNotes: `${job.compNotes || ""}\n\n${job.notes || ""}`
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Company research generation failed.");
      job.companyResearch = payload.research || "";
      job.notes = upsertMarkdownSection(job.notes, "Generated Company and Interview Research", job.companyResearch);
      job.updatedAt = new Date().toISOString();
      persistJobs();
      fillJobDetail(job);
      renderDashboard();
      setText(trackerStatus, "Company research generated and saved in notes.");
    } catch (error) {
      setText(trackerStatus, error.message || "Company research generation failed.");
    }
  });
}

if (webResearchButton) {
  webResearchButton.addEventListener("click", async () => {
    const job = saveCurrentJob();
    if (!job) return;
    setText(trackerStatus, "Researching web sources...");

    try {
      const response = await fetch("/api/admin?action=web-research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          company: job.company,
          role: job.role,
          query: webQuery?.value || ""
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Web research failed.");
      job.webResearch = [
        ...(job.webResearch || []),
        {
          query: payload.query,
          provider: payload.provider,
          results: payload.results || [],
          markdown: payload.markdown || "",
          researchedAt: new Date().toISOString()
        }
      ];
      job.researchSources = `${job.researchSources || ""}\n\n${payload.markdown || ""}`.trim();
      job.updatedAt = new Date().toISOString();
      persistJobs();
      fillJobDetail(job);
      renderDashboard();
      setText(trackerStatus, `Saved ${payload.results?.length || 0} web research sources.`);
    } catch (error) {
      setText(trackerStatus, error.message || "Web research failed.");
    }
  });
}

if (generatePrepButton) {
  generatePrepButton.addEventListener("click", async () => {
    const job = saveCurrentJob();
    if (!job) return;
    setText(trackerStatus, "Generating interview prep...");

    try {
      const response = await fetch("/api/admin?action=prep", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          company: job.company,
          role: job.role,
          jobDescription: job.jobDescription,
          notes: `${job.compNotes || ""}\n\n${job.notes || ""}`,
          generatedPackage: job.generatedPackage
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Interview prep generation failed.");
      job.interviewPrep = payload.prep || "";
      job.notes = upsertMarkdownSection(job.notes, "Generated Interview Prep", job.interviewPrep);
      job.updatedAt = new Date().toISOString();
      persistJobs();
      fillJobDetail(job);
      renderDashboard();
      setText(trackerStatus, "Interview prep generated and saved in notes.");
    } catch (error) {
      setText(trackerStatus, error.message || "Interview prep generation failed.");
    }
  });
}

if (deleteJobButton) {
  deleteJobButton.addEventListener("click", () => {
    const job = selectedJob();
    if (!job) return;
    const confirmed = window.confirm(`Delete ${job.company} - ${job.role}?`);
    if (!confirmed) return;
    jobs = jobs.filter((item) => item.id !== job.id);
    selectedJobId = jobs[0]?.id || "";
    persistJobs();
    fillJobDetail(selectedJob());
    renderJobs();
    renderDashboard();
    setText(trackerStatus, "Job deleted.");
  });
}

if (clearButton) {
  clearButton.addEventListener("click", () => {
    if (output) output.value = "";
    if (downloadButton) downloadButton.disabled = true;
    setText(tailorStatus, "");
  });
}

if (saveProfileButton) {
  saveProfileButton.addEventListener("click", async () => {
    setText(profileStatus, "Saving encrypted resume profile...");
    try {
      const response = await fetch("/api/admin?action=profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile: getProfileValues() })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Profile save failed.");
      setProfileValues(payload.profile || {});
      setText(profileStatus, "Resume profile saved to encrypted database.");
    } catch (error) {
      setText(profileStatus, error.message || "Profile save failed.");
    }
  });
}

if (refreshHealthButton) {
  refreshHealthButton.addEventListener("click", async () => {
    if (healthOutput) {
      healthOutput.hidden = false;
      healthOutput.textContent = "Running diagnostics...";
    }
    try {
      const response = await fetch("/api/admin?action=health", { method: "GET" });
      const payload = await response.json().catch(() => ({}));
      if (healthOutput) healthOutput.textContent = JSON.stringify(payload, null, 2);
    } catch (error) {
      if (healthOutput) healthOutput.textContent = error.message || "Diagnostics failed.";
    }
  });
}

showInviteRegistrationIfNeeded();
checkSession().catch(() => {});
