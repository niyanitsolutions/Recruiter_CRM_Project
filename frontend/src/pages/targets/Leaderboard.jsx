/**
 * Leaderboard Component - Phase 5
 * Displays rankings for different target types
 */
import React, { useState, useEffect } from 'react';
import {
  Trophy, Medal, Award, Crown, TrendingUp, Users,
  DollarSign, Calendar, CheckCircle, ChevronDown
} from 'lucide-react';
import targetService from '../../services/targetService';

const Leaderboard = () => {
  const [selectedType, setSelectedType] = useState('placements');
  const [selectedPeriod, setSelectedPeriod] = useState('monthly');
  const [leaderboard, setLeaderboard] = useState(null);
  const [myRank, setMyRank] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeaderboard();
  }, [selectedType, selectedPeriod]);

  const loadLeaderboard = async () => {
    try {
      setLoading(true);
      const [boardRes, rankRes] = await Promise.all([
        targetService.getLeaderboard(selectedType, { period: selectedPeriod }),
        targetService.getMyRank(selectedType, { period: selectedPeriod })
      ]);
      setLeaderboard(boardRes);
      setMyRank(rankRes);
    } catch (error) {
      console.error('Error loading leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTypeIcon = (type) => {
    const icons = {
      placements: CheckCircle,
      revenue: DollarSign,
      interviews: Calendar,
      candidates_added: Users
    };
    return icons[type] || Trophy;
  };

  const getRankBadge = (rank) => {
    if (rank === 1) {
      return (
        <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full shadow-lg">
          <Crown className="w-5 h-5 text-white" />
        </div>
      );
    }
    if (rank === 2) {
      return (
        <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-br from-gray-300 to-gray-500 rounded-full shadow-lg">
          <Medal className="w-5 h-5 text-white" />
        </div>
      );
    }
    if (rank === 3) {
      return (
        <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-br from-orange-400 to-orange-600 rounded-full shadow-lg">
          <Medal className="w-5 h-5 text-white" />
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center w-10 h-10 bg-gray-100 rounded-full">
        <span className="text-sm font-bold text-gray-600">#{rank}</span>
      </div>
    );
  };

  const TypeIcon = getTypeIcon(selectedType);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="flex bg-gray-100 rounded-lg p-1">
          {targetService.getTargetTypeOptions().slice(0, 4).map(opt => {
            const Icon = getTypeIcon(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => setSelectedType(opt.value)}
                className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors ${
                  selectedType === opt.value
                    ? 'bg-white shadow text-gray-900'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Icon className="w-4 h-4" />
                {opt.label}
              </button>
            );
          })}
        </div>

        <select
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
        >
          {targetService.getPeriodOptions().map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* My Rank Card */}
      {myRank && myRank.rank && (
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 mb-1">Your Current Rank</p>
              <div className="flex items-baseline gap-3">
                <span className="text-5xl font-bold">#{myRank.rank}</span>
                <span className="text-blue-200">of {myRank.total_participants} participants</span>
              </div>
            </div>
            
            {myRank.entry && (
              <div className="text-right">
                <p className="text-blue-100 mb-1">Your Progress</p>
                <p className="text-3xl font-bold">
                  {targetService.formatTargetValue(myRank.entry.current_value || 0, selectedType)}
                </p>
                <p className="text-blue-200">
                  {myRank.entry.percentage?.toFixed(0)}% of target
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Leaderboard */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-500" />
            <h3 className="font-semibold text-gray-900">
              {selectedType.charAt(0).toUpperCase() + selectedType.slice(1)} Leaderboard
            </h3>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
          </div>
        ) : !leaderboard?.entries?.length ? (
          <div className="p-8 text-center text-gray-500">
            No leaderboard data available
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {/* Top 3 */}
            <div className="grid grid-cols-3 gap-4 p-6 bg-gradient-to-b from-gray-50 to-white">
              {leaderboard.entries.slice(0, 3).map((entry, index) => (
                <div
                  key={entry.user_id}
                  className={`text-center ${index === 0 ? 'order-2' : index === 1 ? 'order-1' : 'order-3'}`}
                >
                  <div className="flex justify-center mb-3">
                    {getRankBadge(entry.rank)}
                  </div>
                  <div className={`w-16 h-16 mx-auto rounded-full bg-gradient-to-br ${
                    index === 0 
                      ? 'from-yellow-100 to-yellow-200 ring-4 ring-yellow-300' 
                      : index === 1 
                        ? 'from-gray-100 to-gray-200 ring-2 ring-gray-300'
                        : 'from-orange-100 to-orange-200 ring-2 ring-orange-300'
                  } flex items-center justify-center mb-2`}>
                    <span className={`text-xl font-bold ${
                      index === 0 ? 'text-yellow-700' : index === 1 ? 'text-gray-700' : 'text-orange-700'
                    }`}>
                      {entry.user_name?.charAt(0) || '?'}
                    </span>
                  </div>
                  <p className="font-medium text-gray-900 truncate">{entry.user_name}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {targetService.formatTargetValue(entry.current_value || 0, selectedType)}
                  </p>
                  <p className="text-sm text-gray-500">
                    {entry.percentage?.toFixed(0)}% achieved
                  </p>
                </div>
              ))}
            </div>

            {/* Rest of the list */}
            {leaderboard.entries.slice(3).map((entry) => (
              <div
                key={entry.user_id}
                className={`flex items-center gap-4 px-6 py-4 hover:bg-gray-50 ${
                  entry.user_id === myRank?.entry?.user_id ? 'bg-blue-50' : ''
                }`}
              >
                {getRankBadge(entry.rank)}
                
                <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                  <span className="text-sm font-medium text-gray-600">
                    {entry.user_name?.charAt(0) || '?'}
                  </span>
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{entry.user_name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-32">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${Math.min(entry.percentage || 0, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500">
                      {entry.percentage?.toFixed(0)}%
                    </span>
                  </div>
                </div>
                
                <div className="text-right">
                  <p className="font-semibold text-gray-900">
                    {targetService.formatTargetValue(entry.current_value || 0, selectedType)}
                  </p>
                  <p className="text-xs text-gray-500">
                    / {targetService.formatTargetValue(entry.target_value || 0, selectedType)}
                  </p>
                </div>
                
                <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                  entry.status === 'achieved' || entry.status === 'exceeded'
                    ? 'bg-green-100 text-green-700'
                    : entry.status === 'in_progress'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-700'
                }`}>
                  {entry.status?.replace('_', ' ')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Leaderboard;
