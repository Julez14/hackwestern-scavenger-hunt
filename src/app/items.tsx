import create, { getResponse } from "./axiosInstance";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Submit from "./submit";
import Image from "next/image";
import { blurData } from "../../public/imgPlaceholder";

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

const Items = (props: { teamId: number | string }) => {
    const { teamId } = props;
    const [items, setItems] = useState<item[]>([]);
    const [submissions, setSubmissions] = useState<submission[]>([]);
    const [itemsLoading, setItemsLoading] = useState(true);
    const [submissionsLoading, setSubmissionsLoading] = useState(true);
    const [refetchSubmissions, setRefetchSubmissions] = useState(false);
    const [reviewNotifications, setReviewNotifications] = useState<reviewNotification[]>([]);
    const [unsubmittingId, setUnsubmittingId] = useState<number | null>(null);
    const reviewStatusRef = useRef<Map<number, submission["status"]>>(new Map());
    const reviewNotificationsInitialized = useRef(false);

    const minItemId = items.length > 0 ? Math.min(...items.map((item) => item.display_order)) : 0;

    const groupedItems = React.useMemo(() => {
        const groups: Record<string, item[]> = {};
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

    const getLatestSubmissionForItem = (itemId: number) => {
        const teamSubmissions = submissions
            .filter((submission) => submission.item_id == itemId && submission.team_id == teamId)
            .sort((a, b) => new Date(b.time_submitted).getTime() - new Date(a.time_submitted).getTime());
        const approvedSubmission = teamSubmissions.find((submission) => submission.status === "approved");

        return approvedSubmission || teamSubmissions[0];
    };

    const updateReviewNotifications = useCallback((nextSubmissions: submission[]) => {
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
    }, [teamId]);

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
        <div>
            {reviewNotifications.length > 0 && (
                <div className="sticky top-2 z-20 mb-3 space-y-2">
                    {reviewNotifications.map((notification) => (
                        <button
                            key={notification.id}
                            className="block w-full rounded bg-white px-3 py-2 text-left text-sm font-semibold text-purple-900 shadow"
                            onClick={() => setReviewNotifications((current) => current.filter((item) => item.id !== notification.id))}
                        >
                            Submission for item {notification.itemId - minItemId + 1} was {notification.status}.
                        </button>
                    ))}
                </div>
            )}
            {itemsLoading || submissionsLoading ? <div>Loading...</div> : (
                <div className="space-y-6">
                    {Object.keys(groupedItems).map((category) => (
                        <section key={category}>
                            <h2 className="mb-3 text-2xl font-bold text-purple-200">{category}</h2>
                            <ul>
                                {groupedItems[category].map((item) => {
                                    const latestSubmission = getLatestSubmissionForItem(item.id);
                                    const itemNumber = item.display_order - minItemId + 1;

                                    return (
                                        <li className="bg-purple-900 m-2 p-2 lg:p-3 rounded md:max-w-[50vw] lg:max-w-[40vw] xl:max-w-[30vw] 2xl:max-w-[25vw] 3xl:max-w-[20vw]" key={item.id}>
                                            <div className="lg:mb-3">{itemNumber + ". " + item.item + " (" + item.points + " point" + (item.points === 1 ? "" : "s") + ")"}</div>
                                            {latestSubmission ?
                                                <div className="space-y-2">
                                                    <div className="rounded bg-purple-700 px-2 py-1 text-sm font-semibold capitalize">
                                                        {latestSubmission.status === "pending" && "Pending approval"}
                                                        {latestSubmission.status === "approved" && "Approved"}
                                                        {latestSubmission.status === "denied" && "Denied - submit another photo"}
                                                    </div>
                                                    <Image
                                                        src={latestSubmission.image_url}
                                                        alt="submitted scavenger hunt item"
                                                        placeholder="blur"
                                                        blurDataURL={blurData}
                                                        width={600}
                                                        height={600}
                                                        sizes="100vh"
                                                        style={{ width: '100%', height: 'auto' }}
                                                    />
                                                    {(latestSubmission.status === "pending" || latestSubmission.status === "approved") && (
                                                        <button
                                                            className="rounded bg-white px-3 py-1.5 text-sm font-bold text-purple-950 hover:bg-purple-100 disabled:opacity-60"
                                                            disabled={unsubmittingId === latestSubmission.id}
                                                            onClick={() => unsubmitSubmission(latestSubmission)}
                                                        >
                                                            {unsubmittingId === latestSubmission.id ? "Unsubmitting..." : "Unsubmit"}
                                                        </button>
                                                    )}
                                                    {latestSubmission.status === "denied" && (
                                                        <div>
                                                            choose file to submit
                                                            <Submit itemId={item.id} teamId={teamId} setRefetchSubmissions={setRefetchSubmissions} />
                                                        </div>
                                                    )}
                                                </div>
                                                :
                                                <div>
                                                    choose file to submit
                                                    <Submit itemId={item.id} teamId={teamId} setRefetchSubmissions={setRefetchSubmissions} />
                                                </div>}
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
}

export default Items;
