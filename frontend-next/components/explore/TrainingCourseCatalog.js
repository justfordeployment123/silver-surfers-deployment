'use client';
import { useEffect, useState } from 'react';
import { API_BASE_URL, listPublishedCoursesCached } from '../../lib/apiClient';
import { courseImageSrc } from '../../lib/courseImage';
import { courseCta } from '../../lib/courseArrival';
import ExploreProductCard from './ExploreProductCard';

// Bundled artwork, used until an image is uploaded in admin; others reuse AI Edge's.
const COURSE_IMAGES = {
  'everyday-ai-for-business': '/explore/everyday-ai-for-business.svg',
  'prompting-ai-for-business': '/explore/prompting-ai-for-business.svg',
  'ai-agents-at-work': '/explore/ai-agents-at-work.svg',
};

export default function TrainingCourseCatalog() {
  const [items,setItems] = useState([]);
  const [error,setError] = useState('');
  useEffect(()=>{listPublishedCoursesCached().then(result=>{setItems(result.items || []);setError(result.error || '');});},[]);
  // AI Edge has its own static card (data/explore-products.js), which picks
  // up a GHL order form itself; every other published course is listed here.
  return <>{error && <p role="status">Training courses could not be loaded. Please refresh to try again.</p>}{items.filter(course=>course.slug !== 'ai-edge').map(course=><ExploreProductCard key={course.id} product={{id:course.id,name:course.title,category:'Online Training',description:course.description,tagline:new Intl.NumberFormat('en-US',{style:'currency',currency:course.currency || 'usd'}).format(course.priceCents/100),image:courseImageSrc(course,COURSE_IMAGES,'/explore/ai-edge.svg',API_BASE_URL),imageAlt:`${course.title} online training course`,benefits:[`${course.moduleCount} modules`,`${course.lessonCount} lessons`,'Learn at your own pace'],cta:courseCta(course)}} />)}</>;
}
