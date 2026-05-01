import create, { getResponse } from "./axiosInstance";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Submit from "./submit";
import Image from "next/image";
import { blurData } from "../../public/imgPlaceholder";

const axiosInstanceItem = create("items");
const axiosSubmissions = create("submissions");

const getItems = async () => getResponse(axiosInstanceItem);
const getSubmissions = async () => getResponse(axiosSubmissions);

type item = {
    id: number;
    item: string;
    points: number;
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
    const reviewStatusRef = useRef<Map<number, submission["status"]>>(new Map());
    const reviewNotificationsInitialized = useRef(false);

    const minItemId = items.length > 0 ? Math.min(...items.map((item) => item.id)) : 0;

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
                <ul>
                    {items.sort((a, b) => a.id - b.id).map((item) => {
                        const latestSubmission = getLatestSubmissionForItem(item.id);

                        return (
                            <li className="bg-purple-900 m-2 p-2 lg:p-3 rounded md:max-w-[50vw] lg:max-w-[40vw] xl:max-w-[30vw] 2xl:max-w-[25vw] 3xl:max-w-[20vw]" key={item.id}>
                                <div className="lg:mb-3">{item.id - minItemId + 1 + ". " + item.item + " (" + item.points + " point" + (item.points === 1 ? "" : "s") + ")"}</div>
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
            )}
        </div>
    );
}

export default Items;
