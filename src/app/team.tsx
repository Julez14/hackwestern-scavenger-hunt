import React, { useEffect, useState } from "react";
import create, { getResponse } from "./axiosInstance";

const axiosTeams = create("teams");

export const getTeams = async () => getResponse(axiosTeams);

export const getTeam = async (teamId: string) => {
    try {
        const response = await axiosTeams.get(`/${teamId}`);
        return response.data;
    } catch (error) {
        console.error(error);
    }
}

type team = {
    id: number | string;
    name: string;
    members: string[];
    score: number;
}

const Team = () => {
    const [teams, setTeams] = useState<team[]>([]);
    const [loading, setLoading] = useState(true);

    const getAndUpdateTeams = () => {
        getTeams().then((data) => {
            // Sort the teams by points in descending order for leaderboard
            const sortedTeams = data.teams.sort((a: team, b: team) => b.score - a.score);
            setTeams(sortedTeams);
            setLoading(false);
        });
    }

    // refetch teams every 5 seconds, mostly to update scores but also names
    useEffect(() => {
        getAndUpdateTeams();

        const intervalId = setInterval(() => {
            getAndUpdateTeams();
        }, 5000);

        return () => clearInterval(intervalId);
    }, []);

    return (
        <section className="hw-panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-violet-100 px-4 py-3">
                <div>
                    <div className="hw-overline">Live standings</div>
                    <h2 className="hw-section-title">Leaderboard</h2>
                </div>
                <span className="hw-tag">Top 5</span>
            </div>
            {loading ? (
                <div className="p-4 text-sm font-semibold text-medium">Loading leaderboard...</div>
            ) : (
                <ol className="divide-y divide-violet-100">
                    {teams.slice(0, 5).map((team, index) => (
                        <li key={team.id} className="flex items-center gap-3 px-4 py-3">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-tinted text-sm font-black text-heavy">
                                {index + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-bold text-heavy">Team {team.name}</div>
                                <div className="text-xs font-semibold text-medium">
                                    {team.score} point{team.score === 1 ? "" : "s"}
                                </div>
                            </div>
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
};

export default Team;
export { type team };
