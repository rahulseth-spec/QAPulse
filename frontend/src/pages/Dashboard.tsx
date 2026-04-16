import React from 'react';
import { User } from '../types';

interface DashboardProps {
  user: User;
}

const Dashboard: React.FC<DashboardProps> = ({ user }) => {
  return (
    <div>
      <div className="bg-gradient-to-br from-[#073D44] to-[#407B7E] rounded-[20px] p-8 md:p-10 text-white border border-white/10 shadow-sm">
        <h1 className="text-[32px] leading-[40px] font-bold tracking-tight">Welcome back, {user.name.split(' ')[0]}!</h1>
        <p className="mt-3 text-[15px] leading-[24px] text-white/80">Your QA dashboard is ready.</p>
      </div>
    </div>
  );
};

export default Dashboard;
