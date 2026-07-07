# Career OS

Career OS is a structured career repository for generating tailored resumes, LinkedIn content, cover letters, project portfolio pages, and interview stories.

## Core Rule
Do not invent experience. Use only facts from the `/data` and `/projects` folders. If information is missing, mark it as `NEEDS_CONFIRMATION` instead of guessing.

## How to Use This Repo

### 1. Update the source data
Edit the files in `/data`:

- `profile.yaml` — name, headline, location, target roles
- `roles.yaml` — work history, titles, dates, responsibilities
- `projects.yaml` — flagship work projects
- `accomplishments.yaml` — reusable resume bullets
- `skills.yaml` — technical and leadership skills
- `metrics.yaml` — scale, performance, team size, impact metrics

### 2. Add a job description
Create a new markdown file in `/job_descriptions`.

Example:

```text
job_descriptions/tenna_software_team_lead.md
```

Paste the full job description into that file.

### 3. Run the tailoring prompt
Use `/prompts/tailor_resume.md` with Codex or ChatGPT.

The prompt will:

1. Analyze the job description.
2. Score role fit.
3. Select the best resume type.
4. Choose relevant accomplishments from `/data`.
5. Generate a tailored resume in `/outputs/resumes`.
6. Generate a short cover letter in `/outputs/cover_letters`.
7. List missing information or weak areas.

## Recommended Resume Variants

- Engineering Manager Resume
- Staff Software Engineer Resume
- Senior Software Engineer Resume
- Platform Engineer Resume
- Solutions Architect Resume

## Job Customization Workflow

For each job:

1. Save the job post under `/job_descriptions`.
2. Run the tailor prompt.
3. Review the match report.
4. Edit any facts marked `NEEDS_CONFIRMATION`.
5. Export the final resume to DOCX/PDF.
6. Save final version under `/outputs/resumes/company_role_date.md`.

## Naming Convention

Use lowercase snake_case:

```text
company_role_location_date.md
```

Examples:

```text
tenna_software_team_lead_remote_2026_07.md
allstate_software_engineering_manager_remote_2026_07.md
```
