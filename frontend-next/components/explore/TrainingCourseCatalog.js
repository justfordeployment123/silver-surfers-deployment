'use client';
import { useEffect, useState } from 'react';
import { listPublishedCourses } from '../../lib/apiClient';
import ExploreProductCard from './ExploreProductCard';

export default function TrainingCourseCatalog() {
  const [items,setItems] = useState([]);
  const [error,setError] = useState('');
  useEffect(()=>{listPublishedCourses().then(result=>{setItems(result.items || []);setError(result.error || '');});},[]);
  return <>{error && <p role="status">Training courses could not be loaded. Please refresh to try again.</p>}{items.filter(course=>course.slug !== 'ai-edge').map(course=><ExploreProductCard key={course.id} product={{id:course.id,name:course.title,category:'Online Training',description:course.description,tagline:new Intl.NumberFormat('en-US',{style:'currency',currency:course.currency || 'usd'}).format(course.priceCents/100),image:'/explore/ai-edge.svg',imageAlt:'Online training course',benefits:[`${course.moduleCount} modules`,`${course.lessonCount} lessons`,'Learn at your own pace'],cta:{label:'Purchase course',productKey:`course:${course.slug}`,analyticsId:`training_${course.slug}`}}} />)}</>;
}
