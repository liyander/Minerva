import React, { useMemo, useState, useEffect } from 'react';
import { apiFetch } from '../services/api';

const ActivityPage = () => {
  const [activityData, setActivityData] = useState({ counts: [], logs: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    apiFetch('/profiles/me/activity')
      .then(data => {
        if (mounted) {
          setActivityData(data);
          setLoading(false);
        }
      })
      .catch(err => {
        console.error('Failed to fetch activity', err);
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  // Generate 365 days of mapped real data
  const days = useMemo(() => {
    const arr = [];
    const today = new Date();
    
    const countMap = {};
    activityData.counts.forEach(item => {
      // MySQL returns a date string, safely parse to YYYY-MM-DD
      const dateStr = new Date(item.date).toISOString().split('T')[0];
      countMap[dateStr] = (countMap[dateStr] || 0) + item.count;
    });

    for (let i = 370; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      
      const count = countMap[dateStr] || 0;
      let level = 0;
      if (count === 1 || count === 2) level = 1;
      else if (count >= 3 && count <= 5) level = 2;
      else if (count >= 6 && count <= 9) level = 3;
      else if (count >= 10) level = 4;

      arr.push({ date: d, level, count });
    }
    return arr;
  }, [activityData.counts]);

  const totalContributions = activityData.counts.reduce((sum, item) => sum + item.count, 0);

  const getLevelColor = (level) => {
    // Unused is a distinct neutral color (muted gray). Active uses emerald to mimic GitHub perfectly.
    if (level === 0) return 'bg-slate-200 dark:bg-slate-800';
    if (level === 1) return 'bg-emerald-300 dark:bg-emerald-900';
    if (level === 2) return 'bg-emerald-400 dark:bg-emerald-700';
    if (level === 3) return 'bg-emerald-500 dark:bg-emerald-500';
    return 'bg-emerald-600 dark:bg-emerald-400';
  };

  const formatDateString = (isoString) => {
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full min-h-[50vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="mt-16 md:mt-20 p-4 sm:p-6 lg:p-8 w-full animate-fade-in">
      <div className="mb-8 flex items-center gap-4">
        <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-3xl text-emerald-500">local_fire_department</span>
        </div>
        <div>
          <h1 className="text-3xl font-headline font-bold text-on-background">Your Learning Activity</h1>
          <p className="text-on-surface-variant mt-1">Track your progress, streaks, and course contributions.</p>
        </div>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-3xl p-6 md:p-8 mb-8 shadow-sm">
        <h2 className="text-lg font-headline font-bold text-on-background mb-6">
          {totalContributions} contributions in the last year
        </h2>
        
        <div className="overflow-x-auto pb-4 scrollbar-thin">
          <div className="min-w-max">
            <div className="flex text-xs text-on-surface-variant mb-2 ml-10">
              {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((month, i) => (
                <span key={i} className="w-[66px] text-left">{month}</span>
              ))}
            </div>
            
            <div className="flex gap-2">
              <div className="flex flex-col gap-[3px] text-[10px] text-on-surface-variant w-8">
                <div className="h-3 leading-3 text-right pr-1 invisible">Sun</div>
                <div className="h-3 leading-3 text-right pr-1">Mon</div>
                <div className="h-3 leading-3 text-right pr-1 invisible">Tue</div>
                <div className="h-3 leading-3 text-right pr-1">Wed</div>
                <div className="h-3 leading-3 text-right pr-1 invisible">Thu</div>
                <div className="h-3 leading-3 text-right pr-1">Fri</div>
                <div className="h-3 leading-3 text-right pr-1 invisible">Sat</div>
              </div>
              
              <div className="flex gap-[3px]">
                {Array.from({ length: 53 }).map((_, weekIndex) => (
                  <div key={weekIndex} className="flex flex-col gap-[3px]">
                    {Array.from({ length: 7 }).map((_, dayIndex) => {
                      const dayData = days[weekIndex * 7 + dayIndex];
                      if (!dayData) return <div key={dayIndex} className="w-3 h-3 rounded-[2px] bg-transparent" />;
                      return (
                        <div
                          key={dayIndex}
                          title={`${dayData.date.toDateString()}: ${dayData.count} contributions`}
                          className={`w-3 h-3 rounded-[2px] transition-colors cursor-pointer hover:ring-1 hover:ring-on-background/30 ${getLevelColor(dayData.level)}`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            
            <div className="flex items-center gap-2 text-xs text-on-surface-variant mt-4 ml-8">
              <span>Less</span>
              <div className="flex gap-[3px]">
                <div className="w-3 h-3 rounded-[2px] bg-slate-200 dark:bg-slate-800" />
                <div className="w-3 h-3 rounded-[2px] bg-emerald-300 dark:bg-emerald-900" />
                <div className="w-3 h-3 rounded-[2px] bg-emerald-400 dark:bg-emerald-700" />
                <div className="w-3 h-3 rounded-[2px] bg-emerald-500 dark:bg-emerald-500" />
                <div className="w-3 h-3 rounded-[2px] bg-emerald-600 dark:bg-emerald-400" />
              </div>
              <span>More</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-3xl p-6 md:p-8 shadow-sm">
        <h2 className="text-lg font-headline font-bold text-on-background mb-6">Recent Logs</h2>
        <div className="flex flex-col gap-4">
          {activityData.logs.length === 0 ? (
            <p className="text-on-surface-variant text-sm py-4">No recent activity found. Start a course to see your logs here!</p>
          ) : activityData.logs.map((log, i) => (
            <div key={i} className="flex items-center gap-4 p-4 rounded-2xl border border-outline-variant bg-surface-container hover:bg-surface-container-high transition-colors cursor-default">
              <div className="w-10 h-10 bg-surface-container-highest rounded-xl flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-primary text-xl">{log.icon || 'school'}</span>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold font-headline text-on-background text-sm">Completed Module: {log.action}</h3>
              </div>
              <p className="text-xs text-on-surface-variant font-medium shrink-0">{formatDateString(log.time)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ActivityPage;
