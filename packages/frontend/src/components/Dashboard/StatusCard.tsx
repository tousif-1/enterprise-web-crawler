import React from 'react';
import { Card, CardContent, Typography, Box } from '@mui/material';

interface StatusCardProps {
  title: string;
  value: number | string;
  color?: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success';
  subtitle?: string;
  icon?: React.ReactNode;
}

export const StatusCard: React.FC<StatusCardProps> = ({
  title,
  value,
  color = 'primary',
  subtitle,
  icon,
}) => {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ textAlign: 'center', py: 2 }}>
        {icon && (
          <Box sx={{ mb: 1, color: `${color}.main` }}>
            {icon}
          </Box>
        )}
        
        <Typography
          variant="h4"
          component="div"
          color={`${color}.main`}
          sx={{ fontWeight: 'bold', mb: 0.5 }}
        >
          {typeof value === 'number' ? value.toLocaleString() : value}
        </Typography>
        
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
          {title}
        </Typography>
        
        {subtitle && (
          <Typography variant="caption" color="text.secondary">
            {subtitle}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};