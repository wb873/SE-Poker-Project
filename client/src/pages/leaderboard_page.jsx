import React from 'react';
import PageHeader from '../components/page_header.jsx';
import MonthlyLeaderboard from '../components/monthly_leaderboard.jsx';

// Use the same selected leaderboard, personal ranking and session fallback as
// the main menu instead of maintaining a second API response format.
export default function LeaderboardPage() {
  return <div className="page">
    <PageHeader title="Leaderboard" />
    <MonthlyLeaderboard />
  </div>;
}
