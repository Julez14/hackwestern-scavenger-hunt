"use client";

import create from "./axiosInstance";
import { useEffect, useState } from "react";
import AdminDashboard from "./adminDashboard";
import Items from "./items";
import Team, { getTeams, team } from "./team";

const axiosUpdateName = create("update-name-by-pk");
const ADMIN_TEAM_ID = "6145";

export default function Home() {
  const validTeamIds = [7687, 6215, 9277, 1023, 4136];
  const [teamId, setTeamId] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [teams, setTeams] = useState<team[]>([]);
  const [updatingTeamName, setUpdatingTeamName] = useState(false); // for input field
  const [teamName, setTeamName] = useState("");
  const [isUpdatingTeamName, setIsUpdatingTeamName] = useState(false); // for db updating & loading screen

  // check local storage for team id
  useEffect(() => {
    const storedTeamId = localStorage.getItem("teamId");
    if (storedTeamId) {
      setTeamId(storedTeamId);
    }
    getTeams().then((data) => {
      console.log("teams: ", data);
      setTeams(data.teams);
    });
  }, []);

  useEffect(() => {
    setTeamName(
      teams.filter((team) => team.id == teamId).map((team) => team.name)[0] ||
        "",
    );
    setIsUpdatingTeamName(false);

    const intervalId = setInterval(() => {
      getTeams().then((data) => {
        console.log("refetched teams: ", data);
        setTeams(data.teams);
      });
    }, 5000);

    return () => clearInterval(intervalId);
  }, [teamId, teams]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  return (
    <main className="hw-shell">
      <header className="space-y-3 pt-2">
        <div className="hw-overline">Hack Western 13</div>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="font-dico text-[2.55rem] font-medium leading-[0.95] text-heavy sm:text-6xl">
              Scavenger Hunt
            </h1>
            <p className="mt-3 max-w-md text-sm font-semibold leading-6 text-medium">
              Find prompts, upload proof, and watch the leaderboard shuffle in
              real time.
            </p>
          </div>
        </div>
      </header>

      <section className="hw-panel p-4">
        <div className="hw-overline mb-3">Rules</div>
        <ol className="space-y-3 text-sm font-semibold leading-6 text-heavy">
          <li className="flex gap-3">
            <span className="hw-tag h-7 w-7 shrink-0 justify-center px-0">
              1
            </span>
            <span>
              Find prompts on the list, take a photo, and upload it for points.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="hw-tag h-7 w-7 shrink-0 justify-center px-0">
              2
            </span>
            <span>Photos should include at least one teammate.</span>
          </li>
          <li className="flex gap-3">
            <span className="hw-tag h-7 w-7 shrink-0 justify-center px-0">
              3
            </span>
            <span>
              Only one active image is allowed per prompt. Unsubmit to replace
              it.
            </span>
          </li>
        </ol>
      </section>

      <Team />

      <section className="hw-panel p-4">
        {teamId ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="hw-overline">Current Team</div>
              <div className="text-lg font-bold text-heavy">
                Team ID {teamId}
              </div>
            </div>
            <button
              className="hw-button-secondary w-full sm:w-auto"
              onClick={() => {
                setTeamId("");
                localStorage.removeItem("teamId");
              }}
            >
              Change Team
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block">
              <span className="hw-overline mb-2 block">Enter Team ID</span>
              <input
                onChange={handleInputChange}
                className="hw-input"
                inputMode="numeric"
                placeholder="Team ID"
              />
            </label>
            <button
              className="hw-button-primary w-full"
              onClick={() => {
                setTeamId(inputValue);
                localStorage.setItem("teamId", inputValue);
              }}
            >
              Submit
            </button>
          </div>
        )}
      </section>
      {teamId === ADMIN_TEAM_ID ? (
        <AdminDashboard adminId={ADMIN_TEAM_ID} />
      ) : validTeamIds.includes(parseInt(teamId)) ? (
        <div className="space-y-4">
          <section className="hw-panel p-4">
            {teams.length > 0 ? (
              teams
                .filter((team) => team.id == teamId)
                .map((team) =>
                  !updatingTeamName ? (
                    <div key={team.id} className="space-y-3">
                      <div>
                        <div className="hw-overline">Your Team</div>
                        <div className="font-dico text-3xl font-medium text-heavy">
                          {team.name}
                        </div>
                        <div className="mt-1 text-sm font-bold text-emphasis">
                          {team.score} point{team.score === 1 ? "" : "s"}
                        </div>
                      </div>
                      <div className="rounded-lg bg-highlight px-3 py-2 text-sm font-semibold text-medium">
                        {team.members
                          .map((member: string) => member)
                          .join(", ")}
                      </div>
                      <button
                        className="hw-button-secondary w-full"
                        onClick={() => setUpdatingTeamName(true)}
                      >
                        Edit Team Name
                      </button>
                    </div>
                  ) : (
                    <div key={team.id} className="space-y-3">
                      <label className="block">
                        <span className="hw-overline mb-2 block">
                          New team name
                        </span>
                        <input
                          className="hw-input"
                          onChange={(e) => setTeamName(e.target.value)}
                          placeholder="New team name"
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          className="hw-button-secondary"
                          onClick={() => {
                            setUpdatingTeamName(false);
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          className="hw-button-primary"
                          onClick={() => {
                            setIsUpdatingTeamName(true);
                            setUpdatingTeamName(false);
                            axiosUpdateName
                              .post(`/${teamId}`, {
                                object: {
                                  name: teamName,
                                },
                              })
                              .then(() => {
                                getTeams().then((data) => {
                                  console.log(
                                    "teams after updating name: ",
                                    data,
                                  );
                                  setTeams(data.teams);
                                });
                              });
                          }}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ),
                )
            ) : (
              <div className="hw-muted">Loading team...</div>
            )}
          </section>

          <Items teamId={teamId} />
        </div>
      ) : teamId ? (
        <div className="hw-panel p-4 text-sm font-bold text-red-950">
          Invalid Team ID
        </div>
      ) : null}
      {isUpdatingTeamName && (
        <div className="hw-modal">Updating... Please wait...</div>
      )}
    </main>
  );
}
