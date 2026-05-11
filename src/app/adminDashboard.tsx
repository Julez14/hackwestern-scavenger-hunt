"use client";

import JSZip from "jszip";
import Image from "next/image";
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { blurData } from "../../public/imgPlaceholder";
import create, { getResponse } from "./axiosInstance";
import { getTeams, type team } from "./team";

const axiosItems = create("items");
const axiosSubmissions = create("submissions");
const axiosApproveSubmission = create("approve-submission");
const axiosDenySubmission = create("deny-submission");
const axiosUndoApproval = create("undo-approval");
const axiosResetGame = create("reset-game");
const axiosGameSettings = create("game-settings");
const axiosSetAutoApproval = create("set-auto-approval");
const axiosReplaceItems = create("replace-items");
const axiosAddItem = create("add-item");

const getItems = async () => getResponse(axiosItems);
const getSubmissions = async () => getResponse(axiosSubmissions);
const getGameSettings = async () => getResponse(axiosGameSettings);

type Item = {
    id: number;
    item: string;
    points: number;
    category: string;
    display_order: number;
};

type Submission = {
    id: number;
    team_id: number;
    item_id: number;
    image_url: string;
    time_submitted: string;
    status: "pending" | "approved" | "denied";
    reviewed_at?: string | null;
    reviewed_by?: number | null;
};

type UploadNotification = {
    id: number;
    itemId: number;
    teamId: number;
};

type ExportProgress = {
    phase: string;
    completed: number;
    total: number;
    failed: number;
    cancellable: boolean;
};

type ArchivedSubmission = Submission & {
    category: string;
    item_prompt: string;
    item_points: number;
    prompt_number: number;
    team_name: string;
    photo_path: string | null;
    photo_downloaded: boolean;
    photo_error?: string;
};

type PhotoFailure = {
    submission_id: number;
    image_url: string;
    error: string;
};

type ParsedPrompt = {
    item: string;
    points: number;
    category: string;
    display_order: number;
};

type PromptParseResult = {
    prompts: ParsedPrompt[];
    errors: string[];
};

const statusStyles: Record<Submission["status"], string> = {
    pending: "hw-status-pending",
    approved: "hw-status-approved",
    denied: "hw-status-denied",
};

const formatArchiveDate = (date: Date) => date.toISOString().slice(0, 19).replace(/[:T]/g, "-");

const makeFileSlug = (value: string | number) => String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";

const escapeHtml = (value: string | number | null | undefined) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const getImageExtension = (contentType: string, imageUrl: string) => {
    const normalizedContentType = contentType.toLowerCase();

    if (normalizedContentType.includes("jpeg") || normalizedContentType.includes("jpg")) return "jpg";
    if (normalizedContentType.includes("png")) return "png";
    if (normalizedContentType.includes("webp")) return "webp";
    if (normalizedContentType.includes("gif")) return "gif";

    try {
        const pathname = new URL(imageUrl).pathname;
        const extension = pathname.match(/\.(jpe?g|png|webp|gif)$/i)?.[1];
        if (extension) return extension.toLowerCase().replace("jpeg", "jpg");
    } catch {
        return "jpg";
    }

    return "jpg";
};

const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
};

const isAbortError = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

const promptsToPlaintext = (items: Item[]) => {
    const sortedItems = [...items].sort((a, b) => a.display_order - b.display_order);
    const lines: string[] = [];
    let currentCategory = "";

    sortedItems.forEach((item) => {
        const category = item.category || "Uncategorized";

        if (category !== currentCategory) {
            if (lines.length > 0) {
                lines.push("");
            }
            lines.push(`[${category}]`);
            currentCategory = category;
        }

        lines.push(`${item.points} | ${item.item}`);
    });

    return `${lines.join("\n")}\n`;
};

const parsePromptsPlaintext = (text: string): PromptParseResult => {
    const prompts: ParsedPrompt[] = [];
    const errors: string[] = [];
    let currentCategory = "Uncategorized";

    text.split(/\r?\n/).forEach((rawLine, index) => {
        const lineNumber = index + 1;
        const line = rawLine.trim();

        if (!line || line.startsWith("#")) {
            return;
        }

        const categoryMatch = line.match(/^\[(.+)]$/);
        if (categoryMatch) {
            currentCategory = categoryMatch[1].trim() || "Uncategorized";
            return;
        }

        const promptMatch = line.match(/^(\d+)\s*\|\s*(.+)$/);
        if (!promptMatch) {
            errors.push(`Line ${lineNumber}: use "points | prompt text" under an optional [Category] heading.`);
            return;
        }

        const points = Number(promptMatch[1]);
        const item = promptMatch[2].trim().replace(/\s+#\s*item_id:\d+\s*$/i, "");

        if (!Number.isInteger(points) || points < 0) {
            errors.push(`Line ${lineNumber}: points must be a whole number greater than or equal to 0.`);
        }

        if (!item) {
            errors.push(`Line ${lineNumber}: prompt text cannot be empty.`);
        }

        if (Number.isInteger(points) && points >= 0 && item) {
            prompts.push({
                item,
                points,
                category: currentCategory,
                display_order: prompts.length + 1,
            });
        }
    });

    if (prompts.length === 0) {
        errors.push("Add at least one prompt before saving.");
    }

    return { prompts, errors };
};

const createGalleryHtml = (
    exportedAt: string,
    items: Item[],
    teams: team[],
    submissions: ArchivedSubmission[],
    failures: PhotoFailure[],
) => {
    const minItemDisplayOrder = items.length > 0 ? Math.min(...items.map((item) => item.display_order)) : 0;
    const sortedSubmissions = [...submissions].sort((a, b) => {
        if (a.prompt_number !== b.prompt_number) return a.prompt_number - b.prompt_number;
        if (a.team_id !== b.team_id) return a.team_id - b.team_id;
        return new Date(a.time_submitted).getTime() - new Date(b.time_submitted).getTime();
    });

    const promptSections = [...items]
        .sort((a, b) => a.display_order - b.display_order)
        .map((item) => {
            const promptNumber = item.display_order - minItemDisplayOrder + 1;
            const promptSubmissions = sortedSubmissions.filter((submission) => submission.item_id === item.id);
            const submissionCards = promptSubmissions.map((submission) => {
                const submittedAt = new Date(submission.time_submitted).toLocaleString();
                const imageMarkup = submission.photo_path
                    ? `<img src="${escapeHtml(submission.photo_path)}" alt="${escapeHtml(`Team ${submission.team_name} submission for prompt ${submission.prompt_number}`)}">`
                    : `<a class="missing-photo" href="${escapeHtml(submission.image_url)}">Photo could not be saved locally. Open original URL.</a>`;

                return `
                    <article class="photo-card">
                        <div class="photo-meta">
                            <div>
                                <strong>Team ${escapeHtml(submission.team_name)}</strong>
                                <span>${escapeHtml(submittedAt)}</span>
                            </div>
                            <span class="status ${escapeHtml(submission.status)}">${escapeHtml(submission.status)}</span>
                        </div>
                        ${imageMarkup}
                    </article>
                `;
            }).join("");

            return `
                <section class="prompt-row">
                    <div class="prompt-heading">
                        <div>
                            <div class="prompt">Prompt ${escapeHtml(promptNumber)} - ${escapeHtml(item.category)}</div>
                            <h2>${escapeHtml(item.item)}</h2>
                        </div>
                        <span>${escapeHtml(item.points)} points</span>
                    </div>
                    <div class="photo-row">
                        ${submissionCards || `<div class="empty-row">No submissions for this prompt.</div>`}
                    </div>
                </section>
            `;
        }).join("");

    const teamRows = teams
        .map((currentTeam) => `<li><strong>${escapeHtml(currentTeam.name || currentTeam.id)}</strong> (${escapeHtml(currentTeam.id)}) - ${escapeHtml(currentTeam.score)} points</li>`)
        .join("");

    const promptRows = [...items]
        .sort((a, b) => a.display_order - b.display_order)
        .map((item) => `<li><strong>Prompt ${escapeHtml(item.display_order - minItemDisplayOrder + 1)}</strong> - ${escapeHtml(item.category)} - ${escapeHtml(item.points)} points<br>${escapeHtml(item.item)}</li>`)
        .join("");

    const failureMarkup = failures.length > 0
        ? `<section><h2>Photo Download Issues</h2><ul>${failures.map((failure) => `<li>Submission ${escapeHtml(failure.submission_id)}: ${escapeHtml(failure.error)}</li>`).join("")}</ul></section>`
        : "";

    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Hack Western Scavenger Hunt Archive</title>
    <style>
        :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #3d214c; background: #f7f3ef; }
        body { margin: 0; padding: 32px; background: linear-gradient(145deg, #f7f3ef 0%, #f6f3f9 100%); }
        header, section { max-width: 1120px; margin: 0 auto 28px; }
        h1 { margin: 0; font-size: clamp(2rem, 5vw, 4rem); line-height: 0.98; }
        h2 { margin: 0; font-size: 1.05rem; line-height: 1.35; }
        .summary { margin-top: 12px; color: #776780; font-weight: 700; }
        .gallery { display: grid; gap: 20px; max-width: 1280px; margin: 0 auto; }
        .prompt-row { max-width: none; margin: 0; overflow: hidden; border-radius: 10px; background: #fff; box-shadow: 0 12px 34px rgba(61, 33, 76, 0.12); }
        .prompt-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 16px; border-bottom: 1px solid #efe5f8; }
        .prompt-heading > span { flex: 0 0 auto; border-radius: 8px; background: #f5f2f6; padding: 7px 9px; color: #776780; font-size: 0.82rem; font-weight: 900; }
        .prompt { margin-bottom: 6px; color: #776780; font-size: 0.75rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; }
        .photo-row { display: flex; gap: 14px; overflow-x: auto; padding: 16px; align-items: flex-start; }
        .photo-card { flex: 0 0 280px; overflow: hidden; border-radius: 8px; background: #f5f2f6; }
        .photo-meta { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 10px; }
        .photo-meta strong, .photo-meta span { display: block; }
        .photo-meta span { margin-top: 3px; color: #776780; font-size: 0.75rem; font-weight: 800; }
        .status { flex: 0 0 auto; border-radius: 8px; padding: 5px 8px; font-size: 0.75rem; font-weight: 900; text-transform: capitalize; }
        .pending { background: #fef3c7; color: #713f12; }
        .approved { background: #dcfce7; color: #14532d; }
        .denied { background: #fee2e2; color: #7f1d1d; }
        img { display: block; width: 100%; aspect-ratio: 1 / 1; object-fit: cover; background: #f5f2f6; }
        .missing-photo { display: block; margin: 14px; border: 1px dashed #d7c2e9; border-radius: 8px; padding: 16px; color: #3d214c; font-weight: 800; text-decoration: none; background: #f5f2f6; }
        .empty-row, li { border-radius: 8px; background: #f5f2f6; padding: 7px 9px; }
        .empty-row { color: #776780; font-size: 0.9rem; font-weight: 800; }
        li { color: #3d214c; }
        ul { display: grid; gap: 8px; padding: 0; list-style: none; }
    </style>
</head>
<body>
    <header>
        <h1>Hack Western Scavenger Hunt Archive</h1>
        <div class="summary">Exported ${escapeHtml(new Date(exportedAt).toLocaleString())} - ${escapeHtml(submissions.length)} submissions - ${escapeHtml(failures.length)} photo download issues</div>
    </header>
    ${failureMarkup}
    <section>
        <h2>Teams</h2>
        <ul>${teamRows}</ul>
    </section>
    <section>
        <h2>Prompts</h2>
        <ul>${promptRows}</ul>
    </section>
    <main class="gallery">
        ${promptSections || `<section class="prompt-row"><div class="prompt-heading"><h2>No prompts were exported.</h2></div></section>`}
    </main>
</body>
</html>`;
};

const AdminDashboard = (props: { adminId: string }) => {
    const { adminId } = props;
    const [items, setItems] = useState<Item[]>([]);
    const [teams, setTeams] = useState<team[]>([]);
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [loading, setLoading] = useState(true);
    const [reviewingId, setReviewingId] = useState<number | null>(null);
    const [autoApprovalEnabled, setAutoApprovalEnabled] = useState(false);
    const [updatingAutoApproval, setUpdatingAutoApproval] = useState(false);
    const [resettingGame, setResettingGame] = useState(false);
    const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
    const [lastExportSignature, setLastExportSignature] = useState("");
    const [promptEditorOpen, setPromptEditorOpen] = useState(false);
    const [promptText, setPromptText] = useState("");
    const [promptErrors, setPromptErrors] = useState<string[]>([]);
    const [savingPrompts, setSavingPrompts] = useState(false);
    const [addPromptOpen, setAddPromptOpen] = useState(false);
    const [addPromptText, setAddPromptText] = useState("");
    const [addPromptPoints, setAddPromptPoints] = useState("5");
    const [addPromptCategory, setAddPromptCategory] = useState("");
    const [addPromptError, setAddPromptError] = useState("");
    const [addingPrompt, setAddingPrompt] = useState(false);
    const [uploadNotifications, setUploadNotifications] = useState<UploadNotification[]>([]);
    const seenPendingSubmissionIds = useRef<Set<number>>(new Set());
    const initialized = useRef(false);
    const exportAbortControllerRef = useRef<AbortController | null>(null);
    const exportCompletionTimeoutRef = useRef<number | null>(null);

    const teamsById = useMemo(() => {
        const teamMap = new Map<string, team>();
        teams.forEach((currentTeam) => teamMap.set(String(currentTeam.id), currentTeam));
        return teamMap;
    }, [teams]);

    const minItemId = items.length > 0 ? Math.min(...items.map((item) => item.display_order)) : 0;

    const submissionArchiveSignature = useMemo(() => submissions
        .map((submission) => [
            submission.id,
            submission.team_id,
            submission.item_id,
            submission.image_url,
            submission.time_submitted,
            submission.status,
            submission.reviewed_at || "",
        ].join(":"))
        .sort()
        .join("|"), [submissions]);

    const promptDraft = useMemo(() => parsePromptsPlaintext(promptText), [promptText]);

    const gameIsReset = !loading && teams.length > 0 && submissions.length === 0 && teams.every((currentTeam) => Number(currentTeam.score) === 0);

    const groupedItems = useMemo(() => {
        const groups: Record<string, Item[]> = {};
        items.forEach((item) => {
            const cat = item.category || "Uncategorized";
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(item);
        });
        Object.keys(groups).forEach((cat) => {
            groups[cat].sort((a, b) => a.display_order - b.display_order);
        });
        return groups;
    }, [items]);

    const loadDashboardData = useCallback(async (notifyNewUploads: boolean) => {
        const [itemsData, submissionsData, teamsData, settingsData] = await Promise.all([
            getItems(),
            getSubmissions(),
            getTeams(),
            getGameSettings(),
        ]);

        const nextItems = itemsData?.items || [];
        const nextSubmissions = submissionsData?.submissions || [];
        const nextTeams = teamsData?.teams || [];
        const nextSettings = settingsData?.game_settings_by_pk;
        const pendingSubmissions = nextSubmissions.filter((submission: Submission) => submission.status === "pending");

        if (notifyNewUploads && initialized.current) {
            const newNotifications = pendingSubmissions
                .filter((submission: Submission) => !seenPendingSubmissionIds.current.has(submission.id))
                .map((submission: Submission) => ({
                    id: submission.id,
                    itemId: submission.item_id,
                    teamId: submission.team_id,
                }));

            if (newNotifications.length > 0) {
                setUploadNotifications((current) => [...newNotifications, ...current].slice(0, 12));
            }
        }

        seenPendingSubmissionIds.current = new Set(pendingSubmissions.map((submission: Submission) => submission.id));
        initialized.current = true;

        setItems(nextItems);
        setSubmissions(nextSubmissions);
        setTeams(nextTeams);
        setAutoApprovalEnabled(Boolean(nextSettings?.auto_approval_enabled));
        setLoading(false);
    }, []);

    useEffect(() => {
        loadDashboardData(false);

        const intervalId = setInterval(() => {
            loadDashboardData(true);
        }, 5000);

        return () => clearInterval(intervalId);
    }, [loadDashboardData]);

    useEffect(() => {
        return () => {
            exportAbortControllerRef.current?.abort();

            if (exportCompletionTimeoutRef.current) {
                clearTimeout(exportCompletionTimeoutRef.current);
            }
        };
    }, []);

    const scrollToItem = (itemId: number, notificationId: number) => {
        document.getElementById(`prompt-${itemId}`)?.scrollIntoView({
            behavior: "smooth",
            block: "start",
        });
        setUploadNotifications((current) => current.filter((notification) => notification.id !== notificationId));
    };

    const reviewSubmission = async (submission: Submission, action: "approve" | "deny") => {
        setReviewingId(submission.id);

        try {
            const axiosReview = action === "approve" ? axiosApproveSubmission : axiosDenySubmission;
            await axiosReview.post(`/${submission.id}`, {
                adminId: parseInt(adminId),
            });
            setUploadNotifications((current) => current.filter((notification) => notification.id !== submission.id));
            await loadDashboardData(false);
        } finally {
            setReviewingId(null);
        }
    };

    const undoApproval = async (submission: Submission) => {
        setReviewingId(submission.id);

        try {
            await axiosUndoApproval.post(`/${submission.id}`, {
                adminId: parseInt(adminId),
            });
            await loadDashboardData(false);
        } finally {
            setReviewingId(null);
        }
    };

    const updateAutoApproval = async (enabled: boolean) => {
        setUpdatingAutoApproval(true);

        try {
            const response = await axiosSetAutoApproval.post("/", {
                adminId: parseInt(adminId),
                enabled,
            });
            const updatedSetting = response.data?.set_auto_approval?.[0];
            setAutoApprovalEnabled(Boolean(updatedSetting?.auto_approval_enabled));
        } finally {
            setUpdatingAutoApproval(false);
        }
    };

    const openPromptEditor = () => {
        if (!gameIsReset) {
            return;
        }

        setPromptText(promptsToPlaintext(items));
        setPromptErrors([]);
        setAddPromptOpen(false);
        setPromptEditorOpen(true);
    };

    const importPromptFile = async (event: ChangeEvent<HTMLInputElement>) => {
        if (!gameIsReset) {
            return;
        }

        const file = event.target.files?.[0];
        event.target.value = "";

        if (!file) {
            return;
        }

        try {
            setPromptText(await file.text());
            setPromptErrors([]);
            setAddPromptOpen(false);
            setPromptEditorOpen(true);
        } catch (error) {
            console.error(error);
            setPromptErrors(["Could not read that file. Please try another plaintext file."]);
        }
    };

    const savePrompts = async () => {
        const parsedPrompts = parsePromptsPlaintext(promptText);

        if (!gameIsReset) {
            setPromptErrors(["Prompt list editing is only available after the game has been reset. Use Add Prompt during a live game."]);
            return;
        }

        if (parsedPrompts.errors.length > 0) {
            setPromptErrors(parsedPrompts.errors);
            return;
        }

        setSavingPrompts(true);
        setPromptErrors([]);

        try {
            const response = await axiosReplaceItems.post("/", {
                adminId: parseInt(adminId),
                items: parsedPrompts.prompts,
            });
            const updatedItems = response.data?.replace_items || [];
            setItems(updatedItems);
            setPromptText(promptsToPlaintext(updatedItems));
            setPromptEditorOpen(false);
            await loadDashboardData(false);
        } catch (error) {
            console.error(error);
            setPromptErrors(["Could not save prompts. If you removed prompts with submissions, export/reset the game first or keep those prompt rows."]);
        } finally {
            setSavingPrompts(false);
        }
    };

    const addPrompt = async () => {
        const prompt = addPromptText.trim();
        const points = Number(addPromptPoints);
        const category = addPromptCategory.trim() || "Uncategorized";

        if (!prompt) {
            setAddPromptError("Prompt text cannot be empty.");
            return;
        }

        if (!Number.isInteger(points) || points < 0) {
            setAddPromptError("Points must be a whole number greater than or equal to 0.");
            return;
        }

        setAddingPrompt(true);
        setAddPromptError("");

        try {
            const response = await axiosAddItem.post("/", {
                adminId: parseInt(adminId),
                item: prompt,
                points,
                category,
            });
            const updatedItems = response.data?.add_item || [];
            setItems(updatedItems);
            setAddPromptText("");
            setAddPromptPoints("5");
            setAddPromptCategory("");
            setAddPromptOpen(false);
            await loadDashboardData(false);
        } catch (error) {
            console.error(error);
            setAddPromptError("Could not add this prompt. Please try again.");
        } finally {
            setAddingPrompt(false);
        }
    };

    const cancelExportArchive = () => {
        exportAbortControllerRef.current?.abort();
        setExportProgress((currentProgress) => currentProgress ? {
            ...currentProgress,
            phase: "Cancelling export",
            cancellable: false,
        } : currentProgress);
    };

    const exportGameArchive = useCallback(async () => {
        if (exportProgress) {
            return false;
        }

        if (exportCompletionTimeoutRef.current) {
            clearTimeout(exportCompletionTimeoutRef.current);
            exportCompletionTimeoutRef.current = null;
        }

        const exportedAt = new Date().toISOString();
        const archiveDate = formatArchiveDate(new Date(exportedAt));
        const archiveFilename = `hackwestern-scavenger-hunt-${archiveDate}.zip`;
        const zip = new JSZip();
        const abortController = new AbortController();
        const failures: PhotoFailure[] = [];
        const archivedSubmissions: ArchivedSubmission[] = [];
        const sortedItems = [...items].sort((a, b) => a.display_order - b.display_order);
        const total = submissions.length;

        exportAbortControllerRef.current = abortController;

        setExportProgress({
            phase: "Preparing archive",
            completed: 0,
            total,
            failed: 0,
            cancellable: true,
        });

        try {
            for (let index = 0; index < submissions.length; index += 1) {
                abortController.signal.throwIfAborted();

                const submission = submissions[index];
                const item = items.find((currentItem) => currentItem.id === submission.item_id);
                const submittingTeam = teamsById.get(String(submission.team_id));
                const teamName = String(submittingTeam?.name || submission.team_id);
                const promptNumber = item ? item.display_order - minItemId + 1 : submission.item_id;
                const promptNumberSlug = String(promptNumber).padStart(3, "0");
                const teamFolder = `photos/team-${makeFileSlug(submission.team_id)}-${makeFileSlug(teamName)}`;
                let photoPath: string | null = null;
                let photoError: string | undefined;

                setExportProgress({
                    phase: `Downloading photo ${index + 1} of ${total}`,
                    completed: index,
                    total,
                    failed: failures.length,
                    cancellable: true,
                });

                try {
                    const response = await fetch(submission.image_url, {
                        cache: "no-store",
                        signal: abortController.signal,
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }

                    const photoBlob = await response.blob();
                    abortController.signal.throwIfAborted();

                    const extension = getImageExtension(photoBlob.type, submission.image_url);
                    photoPath = `${teamFolder}/prompt-${promptNumberSlug}-${submission.status}-submission-${submission.id}.${extension}`;
                    zip.file(photoPath, photoBlob);
                } catch (error) {
                    if (abortController.signal.aborted || isAbortError(error)) {
                        throw error;
                    }

                    photoError = error instanceof Error ? error.message : "Unknown photo download error";
                    failures.push({
                        submission_id: submission.id,
                        image_url: submission.image_url,
                        error: photoError,
                    });
                }

                archivedSubmissions.push({
                    ...submission,
                    category: item?.category || "Uncategorized",
                    item_prompt: item?.item || `Item ${submission.item_id}`,
                    item_points: item?.points || 0,
                    prompt_number: promptNumber,
                    team_name: teamName,
                    photo_path: photoPath,
                    photo_downloaded: Boolean(photoPath),
                    photo_error: photoError,
                });

                setExportProgress({
                    phase: `Downloaded ${index + 1} of ${total} photos`,
                    completed: index + 1,
                    total,
                    failed: failures.length,
                    cancellable: true,
                });
            }

            abortController.signal.throwIfAborted();

            const manifest = {
                exported_at: exportedAt,
                game_settings: {
                    auto_approval_enabled: autoApprovalEnabled,
                },
                items: sortedItems,
                teams,
                submissions: archivedSubmissions,
                photo_failures: failures,
            };

            zip.file("manifest.json", JSON.stringify(manifest, null, 2));
            zip.file("prompts.txt", promptsToPlaintext(sortedItems));
            zip.file("gallery.html", createGalleryHtml(exportedAt, sortedItems, teams, archivedSubmissions, failures));

            setExportProgress({
                phase: "Compressing archive",
                completed: total,
                total,
                failed: failures.length,
                cancellable: true,
            });

            const archiveBlob = await zip.generateAsync({ type: "blob" });
            abortController.signal.throwIfAborted();

            downloadBlob(archiveBlob, archiveFilename);
            setLastExportSignature(submissionArchiveSignature);

            setExportProgress({
                phase: "Archive downloaded",
                completed: total,
                total,
                failed: failures.length,
                cancellable: false,
            });

            exportCompletionTimeoutRef.current = window.setTimeout(() => {
                setExportProgress(null);
                exportCompletionTimeoutRef.current = null;
            }, 1800);

            if (failures.length > 0) {
                window.alert(`${failures.length} photo${failures.length === 1 ? "" : "s"} could not be saved locally. The archive still includes their original URLs in manifest.json and gallery.html.`);
            }

            return true;
        } catch (error) {
            if (abortController.signal.aborted || isAbortError(error)) {
                setExportProgress({
                    phase: "Export cancelled",
                    completed: archivedSubmissions.length,
                    total,
                    failed: failures.length,
                    cancellable: false,
                });

                exportCompletionTimeoutRef.current = window.setTimeout(() => {
                    setExportProgress(null);
                    exportCompletionTimeoutRef.current = null;
                }, 1200);

                return false;
            }

            console.error(error);
            window.alert("Could not export the archive. Please try again.");
            setExportProgress(null);
            return false;
        } finally {
            if (exportAbortControllerRef.current === abortController) {
                exportAbortControllerRef.current = null;
            }
        }
    }, [autoApprovalEnabled, exportProgress, items, minItemId, submissionArchiveSignature, submissions, teams, teamsById]);

    const resetGame = async () => {
        if (submissions.length > 0 && lastExportSignature !== submissionArchiveSignature) {
            const shouldExportFirst = window.confirm("Export a game archive before reset? Press OK to download photos and prompts now. After it finishes, click Reset game again. Press Cancel to continue without exporting.");

            if (shouldExportFirst) {
                const didExport = await exportGameArchive();
                if (didExport) {
                    window.alert("Archive exported. Click Reset game again when you're ready to wipe submissions.");
                }
                return;
            }
        }

        const shouldReset = window.confirm("Reset the game? This deletes all submissions and sets every team score to 0.");

        if (!shouldReset) {
            return;
        }

        setResettingGame(true);

        try {
            await axiosResetGame.post("/", {
                adminId: parseInt(adminId),
            });
            setUploadNotifications([]);
            seenPendingSubmissionIds.current = new Set();
            await loadDashboardData(false);
        } finally {
            setResettingGame(false);
        }
    };

    const getItemSubmissions = (itemId: number) => submissions
        .filter((submission) => submission.item_id === itemId)
        .sort((a, b) => {
            if (a.team_id !== b.team_id) {
                return a.team_id - b.team_id;
            }

            return new Date(b.time_submitted).getTime() - new Date(a.time_submitted).getTime();
        });

    return (
        <section className="w-full space-y-4">
            <div className="hw-panel flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <div className="hw-overline">Organizer tools</div>
                    <h2 className="hw-section-title">Admin Dashboard</h2>
                    <p className="mt-1 text-sm font-semibold leading-6 text-medium">Review uploaded photos. Scores are awarded when a pending submission is approved.</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <label className="flex min-h-10 items-center justify-between gap-3 rounded-lg bg-highlight px-4 py-2 text-sm font-bold text-heavy">
                        <span>Auto-approve</span>
                        <input
                            type="checkbox"
                            className="h-5 w-5 accent-[#8F57AD]"
                            checked={autoApprovalEnabled}
                            disabled={updatingAutoApproval}
                            onChange={(event) => updateAutoApproval(event.target.checked)}
                        />
                    </label>
                    <button
                        className="hw-button-secondary"
                        disabled={Boolean(exportProgress) || loading}
                        onClick={exportGameArchive}
                    >
                        {exportProgress ? "Exporting..." : "Export archive"}
                    </button>
                    <button
                        className="hw-button-secondary"
                        disabled={loading || savingPrompts || !gameIsReset}
                        onClick={promptEditorOpen ? () => setPromptEditorOpen(false) : openPromptEditor}
                    >
                        {promptEditorOpen ? "Close prompts" : "Edit prompts"}
                    </button>
                    <button
                        className="hw-button-secondary"
                        disabled={loading || addingPrompt}
                        onClick={() => {
                            setAddPromptOpen((open) => !open);
                            setPromptEditorOpen(false);
                            setAddPromptError("");
                        }}
                    >
                        {addPromptOpen ? "Close add" : "Add prompt"}
                    </button>
                    <button
                        className="hw-button-danger"
                        disabled={resettingGame || Boolean(exportProgress)}
                        onClick={resetGame}
                    >
                        {resettingGame ? "Resetting..." : "Reset game"}
                    </button>
                </div>
            </div>

            {exportProgress && (
                <div className="hw-panel p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <div className="hw-overline">Archive export</div>
                            <div className="mt-1 text-sm font-bold text-heavy">{exportProgress.phase}</div>
                            {exportProgress.failed > 0 && (
                                <div className="mt-1 text-xs font-semibold text-red-950">
                                    {exportProgress.failed} photo{exportProgress.failed === 1 ? "" : "s"} could not be downloaded.
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="text-sm font-bold text-medium">
                                {exportProgress.completed} / {exportProgress.total}
                            </div>
                            {exportProgress.cancellable && (
                                <button
                                    className="hw-button-danger min-h-9 px-3 py-1 text-xs"
                                    onClick={cancelExportArchive}
                                >
                                    Cancel
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-highlight">
                        <div
                            className="h-full rounded-full bg-[#8F57AD] transition-all"
                            style={{
                                width: `${exportProgress.total === 0 ? 100 : Math.round((exportProgress.completed / exportProgress.total) * 100)}%`,
                            }}
                        />
                    </div>
                </div>
            )}

            {addPromptOpen && (
                <div className="hw-panel space-y-4 p-4">
                    <div>
                        <div className="hw-overline">New prompt</div>
                        <div className="mt-1 text-sm font-bold text-heavy">
                            Prompt {items.length + 1}
                        </div>
                    </div>

                    <label className="block">
                        <span className="hw-overline mb-2 block">Prompt text</span>
                        <textarea
                            className="hw-input min-h-28 resize-y text-sm leading-6"
                            value={addPromptText}
                            onChange={(event) => {
                                setAddPromptText(event.target.value);
                                setAddPromptError("");
                            }}
                        />
                    </label>

                    <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
                        <label className="block">
                            <span className="hw-overline mb-2 block">Points</span>
                            <input
                                className="hw-input"
                                inputMode="numeric"
                                value={addPromptPoints}
                                onChange={(event) => {
                                    setAddPromptPoints(event.target.value);
                                    setAddPromptError("");
                                }}
                            />
                        </label>
                        <label className="block">
                            <span className="hw-overline mb-2 block">Category</span>
                            <input
                                className="hw-input"
                                value={addPromptCategory}
                                placeholder="Uncategorized"
                                onChange={(event) => {
                                    setAddPromptCategory(event.target.value);
                                    setAddPromptError("");
                                }}
                            />
                        </label>
                    </div>

                    {addPromptError && (
                        <div className="rounded-lg bg-red-100 p-3 text-sm font-bold text-red-950">
                            {addPromptError}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                        <button
                            className="hw-button-secondary"
                            disabled={addingPrompt}
                            onClick={() => {
                                setAddPromptOpen(false);
                                setAddPromptError("");
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            className="hw-button-primary"
                            disabled={addingPrompt}
                            onClick={addPrompt}
                        >
                            {addingPrompt ? "Adding..." : "Add prompt"}
                        </button>
                    </div>
                </div>
            )}

            {promptEditorOpen && (
                <div className="hw-panel space-y-4 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <div className="hw-overline">Prompt editor</div>
                            <div className="mt-1 text-sm font-bold text-heavy">
                                {promptDraft.prompts.length} prompt{promptDraft.prompts.length === 1 ? "" : "s"}
                            </div>
                        </div>
                        <label className="hw-button-secondary cursor-pointer">
                            Import .txt
                            <input
                                type="file"
                                accept=".txt,text/plain"
                                className="hidden"
                                onChange={importPromptFile}
                            />
                        </label>
                    </div>

                    <textarea
                        className="hw-input min-h-80 resize-y font-mono text-sm leading-6"
                        value={promptText}
                        spellCheck={false}
                        onChange={(event) => {
                            setPromptText(event.target.value);
                            setPromptErrors([]);
                        }}
                    />

                    {promptErrors.length > 0 && (
                        <div className="space-y-2 rounded-lg bg-red-100 p-3 text-sm font-bold text-red-950">
                            {promptErrors.map((error) => (
                                <div key={error}>{error}</div>
                            ))}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                        <button
                            className="hw-button-secondary"
                            disabled={savingPrompts}
                            onClick={() => {
                                setPromptEditorOpen(false);
                                setPromptErrors([]);
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            className="hw-button-primary"
                            disabled={savingPrompts}
                            onClick={savePrompts}
                        >
                            {savingPrompts ? "Saving..." : "Save prompts"}
                        </button>
                    </div>
                </div>
            )}

            <div className="hw-panel p-4">
                <h3 className="hw-overline mb-3">Active Team IDs</h3>
                <div className="flex flex-wrap gap-2">
                    {teams.map((team) => (
                        <span key={team.id} className="rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-heavy shadow-hw-button">
                            {team.id}: {team.name}
                        </span>
                    ))}
                </div>
            </div>

            {uploadNotifications.length > 0 && (
                <div className="sticky top-2 z-30 space-y-2 rounded-lg bg-white p-3 text-heavy shadow-hw-card">
                    <div className="font-bold">New uploads</div>
                    {uploadNotifications.map((notification) => (
                        <button
                            key={notification.id}
                            className="block w-full rounded-lg bg-tinted px-3 py-2 text-left text-sm font-bold hover:bg-active"
                            onClick={() => scrollToItem(notification.itemId, notification.id)}
                        >
                            Team {teamsById.get(String(notification.teamId))?.name || notification.teamId} uploaded a photo for prompt {notification.itemId - minItemId + 1}.
                        </button>
                    ))}
                </div>
            )}

            {loading ? <div className="hw-panel p-4 text-sm font-semibold text-medium">Loading admin dashboard...</div> : (
                <div className="space-y-7">
                    {items.length === 0 && <div className="hw-panel p-4 text-sm font-semibold text-medium">No prompts have been added yet.</div>}
                    {Object.keys(groupedItems).map((category) => (
                        <section key={category} className="space-y-3">
                            <h2 className="hw-overline">{category}</h2>
                            <div className="space-y-4">
                                {groupedItems[category].map((item) => {
                                    const itemSubmissions = getItemSubmissions(item.id);
                                    const itemNumber = item.display_order - minItemId + 1;

                                    return (
                                        <section id={`prompt-${item.id}`} key={item.id} className="hw-card scroll-mt-6 overflow-hidden">
                                            <div className="flex flex-col justify-between gap-2 border-b border-violet-100 px-4 py-3 sm:flex-row sm:items-center">
                                                <div className="flex items-start gap-3">
                                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-tinted text-sm font-black text-heavy">
                                                        {itemNumber}
                                                    </span>
                                                    <h3 className="font-bold leading-5 text-heavy">{item.item}</h3>
                                                </div>
                                                <div className="hw-tag w-fit">{item.points} point{item.points === 1 ? "" : "s"}</div>
                                            </div>

                                            {itemSubmissions.length === 0 ? (
                                                <div className="m-4 rounded-lg border border-dashed border-violet-200 bg-highlight p-4 text-sm font-semibold text-medium">No submissions yet.</div>
                                            ) : (
                                                <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
                                                    {itemSubmissions.map((submission) => {
                                                        const submittingTeam = teamsById.get(String(submission.team_id));
                                                        const isReviewing = reviewingId === submission.id;

                                                        return (
                                                            <article key={submission.id} className="space-y-3 rounded-lg bg-highlight p-3">
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <div>
                                                                        <div className="font-bold text-heavy">Team {submittingTeam?.name || submission.team_id}</div>
                                                                        <div className="text-xs font-semibold text-medium">{new Date(submission.time_submitted).toLocaleString()}</div>
                                                                    </div>
                                                                    <span className={`rounded-lg px-2 py-1 text-xs font-bold capitalize ${statusStyles[submission.status]}`}>
                                                                        {submission.status}
                                                                    </span>
                                                                </div>

                                                                <Image
                                                                    src={submission.image_url}
                                                                    alt={`Team ${submittingTeam?.name || submission.team_id} submission`}
                                                                    placeholder="blur"
                                                                    blurDataURL={blurData}
                                                                    width={600}
                                                                    height={600}
                                                                    sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
                                                                    className="h-auto w-full rounded-lg"
                                                                />

                                                                {submission.status === "pending" ? (
                                                                    <div className="grid grid-cols-2 gap-2">
                                                                        <button
                                                                            className="hw-button-success"
                                                                            disabled={isReviewing}
                                                                            onClick={() => reviewSubmission(submission, "approve")}
                                                                        >
                                                                            Approve
                                                                        </button>
                                                                        <button
                                                                            className="hw-button-danger"
                                                                            disabled={isReviewing}
                                                                            onClick={() => reviewSubmission(submission, "deny")}
                                                                        >
                                                                            Deny
                                                                        </button>
                                                                    </div>
                                                                ) : submission.status === "approved" ? (
                                                                    <div className="space-y-2">
                                                                        <div className="rounded-lg bg-white px-3 py-2 text-sm font-semibold capitalize text-medium">
                                                                            Approved {submission.reviewed_at ? `at ${new Date(submission.reviewed_at).toLocaleString()}` : ""}
                                                                        </div>
                                                                        <button
                                                                            className="w-full rounded-lg bg-yellow-100 px-3 py-2 font-bold text-yellow-950 hover:bg-yellow-200 disabled:opacity-60"
                                                                            disabled={isReviewing}
                                                                            onClick={() => undoApproval(submission)}
                                                                        >
                                                                            Undo approval
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <div className="rounded-lg bg-white px-3 py-2 text-sm font-semibold capitalize text-medium">
                                                                        {submission.status} {submission.reviewed_at ? `at ${new Date(submission.reviewed_at).toLocaleString()}` : ""}
                                                                    </div>
                                                                )}
                                                            </article>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </section>
                                    );
                                })}
                            </div>
                        </section>
                    ))}
                </div>
            )}
        </section>
    );
};

export default AdminDashboard;
