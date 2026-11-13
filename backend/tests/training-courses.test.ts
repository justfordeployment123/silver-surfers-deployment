import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCourseDetails, validateCoursePrice, publicCourse } from '../src/features/courses/course-catalog.ts';
import Course from '../src/models/course.model.ts';
import CoursePurchase from '../src/models/course-purchase.model.ts';
import CourseProgress from '../src/models/course-progress.model.ts';
import { handleProductCheckoutCompleted } from '../src/features/billing/product-checkout.service.ts';
import { mock } from 'node:test';
import { createProductCheckoutSession } from '../src/features/billing/product-checkout.controller.ts';
import { getCourse } from '../src/features/courses/course.controller.ts';
const response = () => ({statusCode:200,body:null as any,status(code:number){this.statusCode=code;return this;},json(body:any){this.body=body;return this;}});
test('new courses default to draft and require a stable slug', () => {
  assert.equal(normalizeCourseDetails({slug:'Leadership AI',description:'Learn AI'}).status,'draft');
  assert.equal(normalizeCourseDetails({slug:'Leadership AI'}).slug,'leadership-ai');
  assert.throws(()=>normalizeCourseDetails({slug:''}),/slug/i);
});
test('published courses require a description, price, and complete lessons', () => {
  assert.throws(()=>normalizeCourseDetails({slug:'test',status:'published'}),/description/i);
  assert.throws(()=>normalizeCourseDetails({slug:'test',status:'published',description:'Learn',stripePriceId:'price_test',modules:[]}),/lesson/i);
});
test('Stripe price must be active, positive, and one-time', () => {
  assert.throws(()=>validateCoursePrice({active:true,type:'recurring',unit_amount:100,currency:'usd'}),/one-time/i);
  assert.throws(()=>validateCoursePrice({active:true,type:'one_time',unit_amount:0,currency:'usd'}),/positive/i);
  assert.deepEqual(validateCoursePrice({active:true,type:'one_time',unit_amount:3700,currency:'usd'}),{priceCents:3700,currency:'usd'});
});
test('public course data excludes video and private resource content', () => {
  const item=publicCourse({_id:'id',slug:'test',title:'Test',description:'Learn',priceCents:3700,currency:'usd',stripePriceId:'price_secret',modules:[{lessons:[{youtubeId:'secret',downloads:[{s3Key:'private'}]}]}]});
  assert.equal(item.lessonCount,1);
  assert.doesNotMatch(JSON.stringify(item),/secret|private/);
});
test('unpaid checkout never grants course access', async () => {
  await handleProductCheckoutCompleted({mode:'payment',payment_status:'unpaid',metadata:{productType:'course',courseSlug:'test',userId:'user'}} as any);
});
test('paid checkout grants exactly its course and preserves progress on webhook retries', async (t) => {
  t.after(()=>mock.restoreAll());
  mock.method(Course,'findOne',()=>({lean:async()=>({_id:'course-specific'})}));
  const purchase=mock.method(CoursePurchase,'updateOne',async()=>({}));
  const progress=mock.method(CourseProgress,'updateOne',async()=>({}));
  const session={id:'cs_paid',mode:'payment',payment_status:'paid',amount_total:3700,metadata:{productType:'course',courseSlug:'test',userId:'user'}};
  await handleProductCheckoutCompleted(session as any);
  await handleProductCheckoutCompleted(session as any);
  for (const call of purchase.mock.calls) assert.deepEqual(call.arguments[0],{userId:'user',courseId:'course-specific',stripeSessionId:'cs_paid'});
  for (const call of progress.mock.calls) {
    assert.deepEqual(call.arguments[0],{userId:'user',courseId:'course-specific'});
    assert.ok(call.arguments[1].$setOnInsert);
    assert.equal(call.arguments[1].$set,undefined);
  }
});
test('draft or missing course cannot start checkout', async t => {
  t.after(()=>mock.restoreAll());
  mock.method(Course,'findOne',(filter:any)=>{assert.equal(filter.status,'published');return {lean:async()=>null};});
  const res=response();
  await createProductCheckoutSession({user:{id:'user'},body:{productKey:'course:hidden'}} as any,res as any);
  assert.equal(res.statusCode,404);
});
test('purchasing one course does not unlock a different course', async t => {
  t.after(()=>mock.restoreAll());
  const anotherCourse='6ad790dd9fefeb3ba6d95840';
  mock.method(Course,'findById',()=>({lean:async()=>({_id:anotherCourse,slug:'another-course'})}));
  mock.method(CoursePurchase,'findOne',(filter:any)=>{assert.deepEqual(filter,{userId:'user',courseId:anotherCourse});return {lean:async()=>null};});
  const res=response();
  await getCourse({user:{id:'user'},params:{courseId:anotherCourse},query:{}} as any,res as any);
  assert.equal(res.statusCode,403);
});
