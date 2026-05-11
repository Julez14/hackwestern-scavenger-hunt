import create, { getResponse } from "./axiosInstance";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Submit from "./submit";
import Image from "next/image";
import { blurData } from "../../public/imgPlaceholder";
import type { team } from "./team";

const axiosInstanceItem = create("items");
const axiosSubmissions = create("submissions");
const axiosUnsubmitSubmission = create("unsubmit-submission");

const getItems = async () => getResponse(axiosInstanceItem);
const getSubmissions = async () => getResponse(axiosSubmissions);

type item = {
    id: number;
    item: string;
    points: number;
    category: string;
    display_order: number;
}

type submission = {
    id: number;
    team_id: number;
    item_id: number;
    image_url: string;
    time_submitted: string;
    status: "pending" | "approved" | "denied";
    reviewed_at?: string | null;
    reviewed_by?: number | null;
}

type reviewNotification = {
    id: number;
    itemId: number;
    status: "approved" | "denied";
}

const statusCopy: Record<submission["status"], string> = {
    pending: "Pending approval",
    approved: "Approved",
    denied: "Denied - submit another photo",
};

const statusTone: Record<submission["status"], string> = {
    pending: "hw-status-pending",
    approved: "hw-status-approved",
    denied: "hw-status-denied",
};

const Items = (props: { teamId: number | string; spectatorMode?: boolean; teams?: team[] }) => {
    const { teamId, spectatorMode = false, teams = [] } = props;
    const [items, setItems] = useState<item[]>([]);
    const [submissions, setSubmissions] = useState<submission[]>([]);
    const [itemsLoading, setItemsLoading] = useState(true);
    const [submissionsLoading, setSubmissionsLoading] = useState(true);
    const [refetchSubmissions, setRefetchSubmissions] = useState(false);
    const [reviewNotifications, setReviewNotifications] = useState<reviewNotification[]>([]);
    const [unsubmittingId, setUnsubmittingId] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const reviewStatusRef = useRef<Map<number, submission["status"]>>(new Map());
    const reviewNotificationsInitialized = useRef(false);

    const minItemId = items.length > 0 ? Math.min(...items.map((item) => item.display_order)) : 0;
    const normalizedSearchQuery = searchQuery.trim().toLowerCase();
    const filteredItems = React.useMemo(() => {
        if (!normalizedSearchQuery) {
            return items;
        }

        return items.filter((item) => {
            const itemNumber = item.display_order - minItemId + 1;
            const searchableText = [
                item.item,
                item.category,
                `${item.points} point${item.points === 1 ? "" : "s"}`,
                `item ${itemNumber}`,
                `${itemNumber}`,
            ].join(" ").toLowerCase();

            return searchableText.includes(normalizedSearchQuery);
        });
    }, [items, minItemId, normalizedSearchQuery]);

    const groupedItems = React.useMemo(() => {
        const groups: Record<string, item[]> = {};
        filteredItems.forEach((item) => {
            const cat = item.category || "Uncategorized";
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(item);
        });
        Object.keys(groups).forEach((cat) => {
            groups[cat].sort((a, b) => a.display_order - b.display_order);
        });
        return groups;
    }, [filteredItems]);

    const getLatestSubmissionForItem = (itemId: number) => {
        const teamSubmissions = submissions
            .filter((submission) => submission.item_id == itemId && submission.team_id == teamId)
            .sort((a, b) => new Date(b.time_submitted).getTime() - new Date(a.time_submitted).getTime());
        const approvedSubmission = teamSubmissions.find((submission) => submission.status === "approved");

        return approvedSubmission || teamSubmissions[0];
    };

    const getSubmissionsForItem = (itemId: number) => {
        return submissions
            .filter((submission) => submission.item_id == itemId)
            .sort((a, b) => {
                if (a.team_id !== b.team_id) {
                    return a.team_id - b.team_id;
                }

                return new Date(b.time_submitted).getTime() - new Date(a.time_submitted).getTime();
            });
    };

    const getTeamLabel = (submissionTeamId: number) => {
        const submittingTeam = teams.find((team) => Number(team.id) === submissionTeamId);
        return submittingTeam ? `Team ${submittingTeam.name}` : `Team ${submissionTeamId}`;
    };

    const updateReviewNotifications = useCallback((nextSubmissions: submission[]) => {
        if (spectatorMode) {
            reviewStatusRef.current = new Map();
            reviewNotificationsInitialized.current = true;
            return;
        }

        const nextStatuses = new Map<number, submission["status"]>();
        const newNotifications: reviewNotification[] = [];

        nextSubmissions
            .filter((submission) => submission.team_id == teamId)
            .forEach((submission) => {
                nextStatuses.set(submission.id, submission.status);
                const previousStatus = reviewStatusRef.current.get(submission.id);

                if (
                    reviewNotificationsInitialized.current &&
                    previousStatus === "pending" &&
                    (submission.status === "approved" || submission.status === "denied")
                ) {
                    newNotifications.push({
                        id: submission.id,
                        itemId: submission.item_id,
                        status: submission.status,
                    });
                }
            });

        reviewStatusRef.current = nextStatuses;
        reviewNotificationsInitialized.current = true;

        if (newNotifications.length > 0) {
            setReviewNotifications((current) => [...newNotifications, ...current].slice(0, 5));
        }
    }, [spectatorMode, teamId]);

    // fetch items and submissions
    const getAndUpdateItemsAndSubmissions = useCallback(() => {
        getItems().then((data) => {
            console.log("items: ", data);
            setItems(data.items);
            setItemsLoading(false);
        });
        getSubmissions().then((data) => {
            console.log("submissions: ", data);
            const nextSubmissions = data.submissions || [];
            updateReviewNotifications(nextSubmissions);
            setSubmissions(nextSubmissions);
            setSubmissionsLoading(false);
        });
    }, [updateReviewNotifications]);

    // set flag to refetch submissions every 5 seconds
    useEffect(() => {
        setRefetchSubmissions(true);

        const intervalId = setInterval(() => {
            setRefetchSubmissions(true);
        }, 5000);

        return () => clearInterval(intervalId);
    }, [getAndUpdateItemsAndSubmissions]);

    // fetch items and submissions when refetchSubmissions becomes true
    useEffect(() => {
        if (refetchSubmissions) {
            getAndUpdateItemsAndSubmissions();
            setRefetchSubmissions(false);
        }
    }, [getAndUpdateItemsAndSubmissions, refetchSubmissions]);

    const unsubmitSubmission = async (submission: submission) => {
        if (spectatorMode) {
            return;
        }

        const isApproved = submission.status === "approved";
        const shouldUnsubmit = window.confirm(
            isApproved
                ? "Unsubmit this approved photo? Your team will lose these points until another photo is approved."
                : "Unsubmit this photo? You can upload another one after it is removed."
        );

        if (!shouldUnsubmit) {
            return;
        }

        setUnsubmittingId(submission.id);

        try {
            await axiosUnsubmitSubmission.post(`/${submission.id}`, {
                teamId: Number(teamId),
            });
            setRefetchSubmissions(true);
        } catch (error) {
            console.error(error);
            window.alert("Could not unsubmit this photo. Please try again.");
        } finally {
            setUnsubmittingId(null);
        }
    };

    return (
        <section className="space-y-5">
            {reviewNotifications.length > 0 && (
                <div className="sticky top-2 z-20 mb-3 space-y-2">
                    {reviewNotifications.map((notification) => (
                        <button
                            key={notification.id}
                            className="block w-full rounded-lg bg-white px-3 py-2 text-left text-sm font-bold text-heavy shadow-hw-button"
                            onClick={() => setReviewNotifications((current) => current.filter((item) => item.id !== notification.id))}
                        >
                            Submission for item {notification.itemId - minItemId + 1} was {notification.status}.
                        </button>
                    ))}
                </div>
            )}
            <div>
                <div className="hw-overline">Prompts</div>
                <h2 className="hw-section-title">{spectatorMode ? "Submission gallery" : "Item list"}</h2>
            </div>
            <label className="block">
                <span className="hw-overline mb-2 block">Search items</span>
                <input
                    type="search"
                    className="hw-input"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search by prompt, category, points, or item number"
                    aria-label="Search scavenger hunt items"
                />
            </label>
            {itemsLoading || submissionsLoading ? <div className="hw-panel p-4 text-sm font-semibold text-medium">Loading prompts...</div> : (
                <div className="space-y-6">
                    {Object.keys(groupedItems).length > 0 ? Object.keys(groupedItems).map((category) => (
                        <section key={category} className="space-y-3">
                            <h3 className="hw-overline">{category}</h3>
                            <ul className="space-y-3">
                                {groupedItems[category].map((item) => {
                                    const latestSubmission = getLatestSubmissionForItem(item.id);
                                    const itemSubmissions = spectatorMode ? getSubmissionsForItem(item.id) : [];
                                    const itemNumber = item.display_order - minItemId + 1;

                                    return (
                                        <li className="hw-card overflow-hidden" key={item.id}>
                                            <div className="flex items-start gap-3 border-b border-violet-100 px-4 py-3">
                                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-tinted text-sm font-black text-heavy">
                                                    {itemNumber}
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <div className="font-bold leading-5 text-heavy">{item.item}</div>
                                                    <div className="mt-1 text-xs font-bold text-emphasis">
                                                        {item.points} point{item.points === 1 ? "" : "s"}
                                                    </div>
                                                </div>
                                            </div>
                                            {spectatorMode ? (
                                                itemSubmissions.length > 0 ? (
                                                    <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
                                                        {itemSubmissions.map((submission) => (
                                                            <article key={submission.id} className="space-y-3 rounded-lg bg-highlight p-3">
                                                                <div className="flex items-start justify-between gap-3">
                                                                    <div className="min-w-0">
                                                                        <div className="truncate text-sm font-bold text-heavy">
                                                                            {getTeamLabel(submission.team_id)}
                                                                        </div>
                                                                        <div className="text-xs font-semibold text-medium">
                                                                            {new Date(submission.time_submitted).toLocaleString()}
                                                                        </div>
                                                                    </div>
                                                                    <span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-bold ${statusTone[submission.status]}`}>
                                                                        {submission.status}
                                                                    </span>
                                                                </div>
                                                                <Image
                                                                    src={submission.image_url}
                                                                    alt={`${getTeamLabel(submission.team_id)} submission`}
                                                                    placeholder="blur"
                                                                    blurDataURL={blurData}
                                                                    width={600}
                                                                    height={600}
                                                                    sizes="(min-width: 640px) 50vw, 100vw"
                                                                    className="h-auto w-full rounded-lg"
                                                                />
                                                            </article>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="p-4">
                                                        <div className="hw-muted">No submissions yet.</div>
                                                    </div>
                                                )
                                            ) : latestSubmission ?
                                                <div className="space-y-3 p-4">
                                                    <div className={`rounded-lg px-3 py-2 text-sm font-bold ${statusTone[latestSubmission.status]}`}>
                                                        {statusCopy[latestSubmission.status]}
                                                    </div>
                                                    <Image
                                                        src={latestSubmission.image_url}
                                                        alt="submitted scavenger hunt item"
                                                        placeholder="blur"
                                                        blurDataURL={blurData}
                                                        width={600}
                                                        height={600}
                                                        sizes="100vh"
                                                        className="h-auto w-full rounded-lg"
                                                    />
                                                    {(latestSubmission.status === "pending" || latestSubmission.status === "approved") && (
                                                        <button
                                                            className="hw-button-secondary w-full"
                                                            disabled={unsubmittingId === latestSubmission.id}
                                                            onClick={() => unsubmitSubmission(latestSubmission)}
                                                        >
                                                            {unsubmittingId === latestSubmission.id ? "Unsubmitting..." : "Unsubmit"}
                                                        </button>
                                                    )}
                                                    {latestSubmission.status === "denied" && (
                                                        <div className="space-y-2">
                                                            <div className="hw-muted">Choose a new photo to submit.</div>
                                                            <Submit itemId={item.id} teamId={teamId} setRefetchSubmissions={setRefetchSubmissions} />
                                                        </div>
                                                    )}
                                                </div>
                                                :
                                                <div className="space-y-2 p-4">
                                                    <div className="hw-muted">Choose a photo to submit.</div>
                                                    <Submit itemId={item.id} teamId={teamId} setRefetchSubmissions={setRefetchSubmissions} />
                                                </div>}
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    )) : (
                        <div className="hw-panel p-4 text-sm font-semibold text-medium">
                            No items match your search.
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}

export default Items;
