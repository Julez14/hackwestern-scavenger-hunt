"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { blurData } from "../../public/imgPlaceholder";
import create, { getResponse } from "./axiosInstance";
import { getTeams, type team } from "./team";

const axiosItems = create("items");
const axiosSubmissions = create("submissions");
const axiosApproveSubmission = create("approve-submission");
const axiosDenySubmission = create("deny-submission");

const getItems = async () => getResponse(axiosItems);
const getSubmissions = async () => getResponse(axiosSubmissions);

type Item = {
    id: number;
    item: string;
    points: number;
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

const statusStyles: Record<Submission["status"], string> = {
    pending: "bg-yellow-200 text-yellow-950",
    approved: "bg-green-200 text-green-950",
    denied: "bg-red-200 text-red-950",
};

const AdminDashboard = (props: { adminId: string }) => {
    const { adminId } = props;
    const [items, setItems] = useState<Item[]>([]);
    const [teams, setTeams] = useState<team[]>([]);
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [loading, setLoading] = useState(true);
    const [reviewingId, setReviewingId] = useState<number | null>(null);
    const [uploadNotifications, setUploadNotifications] = useState<UploadNotification[]>([]);
    const seenPendingSubmissionIds = useRef<Set<number>>(new Set());
    const initialized = useRef(false);

    const teamsById = useMemo(() => {
        const teamMap = new Map<string, team>();
        teams.forEach((currentTeam) => teamMap.set(String(currentTeam.id), currentTeam));
        return teamMap;
    }, [teams]);

    const minItemId = items.length > 0 ? Math.min(...items.map((item) => item.id)) : 0;

    const loadDashboardData = useCallback(async (notifyNewUploads: boolean) => {
        const [itemsData, submissionsData, teamsData] = await Promise.all([
            getItems(),
            getSubmissions(),
            getTeams(),
        ]);

        const nextItems = itemsData?.items || [];
        const nextSubmissions = submissionsData?.submissions || [];
        const nextTeams = teamsData?.teams || [];
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
        setLoading(false);
    }, []);

    useEffect(() => {
        loadDashboardData(false);

        const intervalId = setInterval(() => {
            loadDashboardData(true);
        }, 5000);

        return () => clearInterval(intervalId);
    }, [loadDashboardData]);

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

    const getItemSubmissions = (itemId: number) => submissions
        .filter((submission) => submission.item_id === itemId)
        .sort((a, b) => {
            if (a.team_id !== b.team_id) {
                return a.team_id - b.team_id;
            }

            return new Date(b.time_submitted).getTime() - new Date(a.time_submitted).getTime();
        });

    return (
        <section className="w-full max-w-6xl space-y-4">
            <div className="rounded bg-purple-950 p-4 text-white shadow">
                <h2 className="text-2xl font-black">Admin Dashboard</h2>
                <p className="text-sm text-purple-100">Review uploaded photos. Scores are awarded only when a pending submission is approved.</p>
            </div>

            {uploadNotifications.length > 0 && (
                <div className="sticky top-2 z-30 space-y-2 rounded bg-white p-3 text-purple-950 shadow-lg">
                    <div className="font-bold">New uploads</div>
                    {uploadNotifications.map((notification) => (
                        <button
                            key={notification.id}
                            className="block w-full rounded bg-purple-100 px-3 py-2 text-left text-sm font-semibold hover:bg-purple-200"
                            onClick={() => scrollToItem(notification.itemId, notification.id)}
                        >
                            Team {teamsById.get(String(notification.teamId))?.name || notification.teamId} uploaded a photo for prompt {notification.itemId - minItemId + 1}.
                        </button>
                    ))}
                </div>
            )}

            {loading ? <div>Loading admin dashboard...</div> : (
                <div className="space-y-5">
                    {items.length === 0 && <div className="rounded bg-purple-900 p-4">No prompts have been added yet.</div>}
                    {[...items].sort((a, b) => a.id - b.id).map((item) => {
                        const itemSubmissions = getItemSubmissions(item.id);

                        return (
                            <section id={`prompt-${item.id}`} key={item.id} className="scroll-mt-6 rounded bg-purple-900 p-4">
                                <div className="mb-3 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                                    <h3 className="text-xl font-bold">{item.id - minItemId + 1}. {item.item}</h3>
                                    <div className="rounded bg-purple-700 px-3 py-1 text-sm font-semibold">{item.points} point{item.points === 1 ? "" : "s"}</div>
                                </div>

                                {itemSubmissions.length === 0 ? (
                                    <div className="rounded border border-dashed border-purple-400 p-4 text-purple-100">No submissions yet.</div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                                        {itemSubmissions.map((submission) => {
                                            const submittingTeam = teamsById.get(String(submission.team_id));
                                            const isReviewing = reviewingId === submission.id;

                                            return (
                                                <article key={submission.id} className="space-y-2 rounded bg-purple-950 p-3">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div>
                                                            <div className="font-bold">Team {submittingTeam?.name || submission.team_id}</div>
                                                            <div className="text-xs text-purple-200">{new Date(submission.time_submitted).toLocaleString()}</div>
                                                        </div>
                                                        <span className={`rounded px-2 py-1 text-xs font-bold capitalize ${statusStyles[submission.status]}`}>
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
                                                        className="h-auto w-full rounded"
                                                    />

                                                    {submission.status === "pending" ? (
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <button
                                                                className="rounded bg-green-200 px-3 py-2 font-bold text-green-950 hover:bg-green-300 disabled:opacity-60"
                                                                disabled={isReviewing}
                                                                onClick={() => reviewSubmission(submission, "approve")}
                                                            >
                                                                Approve
                                                            </button>
                                                            <button
                                                                className="rounded bg-red-200 px-3 py-2 font-bold text-red-950 hover:bg-red-300 disabled:opacity-60"
                                                                disabled={isReviewing}
                                                                onClick={() => reviewSubmission(submission, "deny")}
                                                            >
                                                                Deny
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="rounded bg-purple-800 px-3 py-2 text-sm capitalize">
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
            )}
        </section>
    );
};

export default AdminDashboard;
