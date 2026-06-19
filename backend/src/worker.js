export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {

    if (request.method === "OPTIONS") {
      return corsResponse();
    }

    if (url.pathname === "/") {
      return json({
        success: true,
        service: "rebootworker",
        version: "1.0"
      });
    }
    if (url.pathname === "/api/resources/list") {
  return getResourcesEndpoint(request, env);
}

if (url.pathname === "/api/student/resources/list") {
  return getResourcesEndpoint(request, env);
}

if (url.pathname === "/api/admin/resources/list") {
  return getResourcesEndpoint(request, env);
}
   
    
    if (url.pathname === "/api/admin/check-admin") {
      return checkAdmin(request, env);
    }

    if (url.pathname === "/api/admin/setup-pin") {
      return setupAdminPin(request, env);
    }

 if (url.pathname === "/api/attendance/submit-absent") {
  return submitAbsentAttendance(request, env);
 }

if (url.pathname === "/api/attendance/students") {
  return attendanceStudents(request, env);
}

    if (url.pathname === "/api/attendance/report") {
  return attendanceReport(request, env);
}
    
    if (url.pathname === "/api/admin/login") {
      return adminLogin(request, env);
    }
    if (url.pathname === "/api/admin/check-student-duplicate") {
  return checkStudentDuplicateAdmin(request, env);
    }

    if (url.pathname === "/api/admin/register-student") {
  return registerStudentAdmin(request, env);
    }

    if (url.pathname === "/api/admin/update-student") {
  return updateStudentAdmin(request, env);
}

    if (
      url.pathname === "/api/admin/students/search" ||
      url.pathname === "/api/admin/search-students" ||
      url.pathname === "/api/admin/student/search"
    ) {
      return searchStudentsAdmin(request, env);
    }

    if (url.pathname === "/api/admin/students/assignment-options") {
      return getStudentAssignmentOptionsAdmin(request, env);
    }

    
    if (url.pathname === "/api/admin/reset-pin") {
      return resetPin(request, env);
    }

    if (url.pathname === "/api/check-student") {
      return checkStudent(request, env);
    }

    if (url.pathname === "/api/setup-pin") {
      return setupPin(request, env);
    }

    if (url.pathname === "/api/login") {
      return login(request, env);
    }
if (url.pathname === "/api/admin/subjects/create") {
  return createSubjectAdmin(request, env);
}

if (url.pathname === "/api/admin/subjects/list") {
  return listSubjectsAdmin(request, env);
}

if (url.pathname === "/api/admin/subjects/update") {
  return updateSubjectAdmin(request, env);
}
if (url.pathname === "/api/admin/subject-resources/create") {
  return createSubjectResourceAdmin(request, env);
}

if (url.pathname === "/api/admin/subject-resources/list") {
  return listSubjectResourcesAdmin(request, env);
}

if (url.pathname === "/api/admin/subject-resources/update") {
  return updateSubjectResourceAdmin(request, env);
}
if (url.pathname === "/api/admin/tasks/create") {
  return createTaskAdmin(request, env);
}

if (url.pathname === "/api/admin/tasks/list") {
  return listTasksAdmin(request, env);
}

if (url.pathname === "/api/admin/tasks/update") {
  return updateTaskAdmin(request, env);
}
if (url.pathname === "/api/admin/tasks/assign") {
  return assignTasksAdmin(request, env);
}
if (url.pathname === "/api/tasks/student") {
  return getStudentTasksEndpoint(request, env);
}
if (url.pathname === "/api/tasks/update-complete") {
  return updateTaskComplete(request, env);
}
 if (url.pathname === "/api/admin/tasks/verify") {
  return verifyStudentTask(request, env);
}
if (url.pathname === "/api/progress/tasks") {
  return taskProgressReport(request, env);
}

if (url.pathname === "/api/progress/task-detail") {
  return taskProgressDetail(request, env);
}
    
    
    

    
    return json({ success: false, error: "Not found" }, 404);

    } catch (err) {
      return json({
        success: false,
        error: "Worker error",
        detail: err && err.message ? err.message : String(err)
      }, 500);
    }
  }
};

async function checkAdmin(request, env) {
  const body = await request.json();
  const uniqueid = body.uniqueid;

  if (!uniqueid) {
    return json({ success: false, error: "Missing uniqueid" }, 400);
  }

  const result = await callAppsScript(env, {
    action: "getAdminByUniqueId",
    uniqueid
  });

  if (!result.admin) {
    return json({ success: false, error: "Invalid admin link" }, 404);
  }

  const admin = result.admin;

  if (admin.active !== true) {
    return json({ success: false, error: "Admin account disabled" }, 403);
  }

  return json({
    success: true,
    admin: {
      adminid: admin.adminid,
      username: admin.username,
      uniqueid: admin.uniqueid,
      role: admin.role,
      assignedgroup: admin.assignedgroup,
      pinsetup: admin.pinsetup
    }
  });
}

async function setupAdminPin(request, env) {
  const body = await request.json();
  const uniqueid = body.uniqueid;
  const pin = body.pin;

  if (!uniqueid) {
    return json({ success: false, error: "Missing uniqueid" }, 400);
  }

  if (!/^\d{4}$/.test(pin)) {
    return json({ success: false, error: "PIN must be 4 digits" }, 400);
  }

  const pinhash = await hashPin(pin, env.PIN_SECRET);

  const result = await callAppsScript(env, {
    action: "setAdminPin",
    data: { uniqueid, pinhash }
  });

  return json(result);
}

async function adminLogin(request, env) {
  const body = await request.json();
  const uniqueid = body.uniqueid;
  const pin = body.pin;

  if (!uniqueid) {
    return json({ success: false, error: "Missing uniqueid" }, 400);
  }

  if (!/^\d{4}$/.test(pin)) {
    return json({ success: false, error: "PIN must be 4 digits" }, 400);
  }

  const result = await callAppsScript(env, {
    action: "getAdminByUniqueId",
    uniqueid
  });

  if (!result.admin) {
    return json({ success: false, error: "Invalid admin link" }, 404);
  }

  const admin = result.admin;

  if (admin.active !== true) {
    return json({ success: false, error: "Account disabled" }, 403);
  }

  if (admin.pinsetup !== true) {
    return json({ success: false, error: "Admin PIN not set up yet" }, 403);
  }

  const enteredHash = await hashPin(pin, env.PIN_SECRET);

  if (enteredHash !== admin.pinhash) {
    return json({ success: false, error: "Incorrect PIN" }, 401);
  }

  const token = await createSessionToken({
    type: "admin",
    adminid: admin.adminid,
    username: admin.username,
    role: admin.role,
    assignedgroup: admin.assignedgroup
  }, env);

  return json({
    success: true,
    message: "Admin login successful",
    token,
    admin: {
      adminid: admin.adminid,
      username: admin.username,
      uniqueid: admin.uniqueid,
      role: admin.role,
      assignedgroup: admin.assignedgroup
    }
  });
}

async function checkStudent(request, env) {
  const body = await request.json();

  const result = await callAppsScript(env, {
    action: "getStudentByUniqueId",
    uniqueid: body.uniqueid
  });

  if (!result.student) {
    return json({ success: false, error: "Invalid login link" }, 404);
  }

  if (result.student.active !== true) {
    return json({ success: false, error: "Account disabled" }, 403);
  }

  return json({
    success: true,
    student: {
      studentid: result.student.studentid,
      username: result.student.username,
      classgroup: result.student.classgroup,
      pinsetup: result.student.pinsetup
    }
  });
}

async function setupPin(request, env) {
  const body = await request.json();
  const uniqueid = body.uniqueid;
  const pin = body.pin;

  if (!uniqueid) {
    return json({ success: false, error: "Missing uniqueid" }, 400);
  }

  if (!/^\d{4}$/.test(pin)) {
    return json({ success: false, error: "PIN must be 4 digits" }, 400);
  }

  const pinhash = await hashPin(pin, env.PIN_SECRET);

  const result = await callAppsScript(env, {
    action: "setStudentPin",
    data: { uniqueid, pinhash }
  });

  return json(result);
}

async function login(request, env) {
  const body = await request.json();
  const uniqueid = body.uniqueid;
  const pin = body.pin;

  if (!uniqueid) {
    return json({ success: false, error: "Missing uniqueid" }, 400);
  }

  if (!/^\d{4}$/.test(pin)) {
    return json({ success: false, error: "PIN must be 4 digits" }, 400);
  }

  const result = await callAppsScript(env, {
    action: "getStudentForLogin",
    uniqueid
  });

  if (!result.student) {
    return json({ success: false, error: "Invalid login link" }, 404);
  }

  const student = result.student;

  if (student.active !== true) {
    return json({ success: false, error: "Account disabled" }, 403);
  }

  if (student.pinsetup !== true) {
    return json({ success: false, error: "PIN not set up yet" }, 403);
  }

  const enteredHash = await hashPin(pin, env.PIN_SECRET);

  if (enteredHash !== student.pinhash) {
    return json({ success: false, error: "Incorrect PIN" }, 401);
  }
  
  const token = await createSessionToken({
    type: "student",
    studentid: student.studentid,
    username: student.username,
    classgroup: student.classgroup
  }, env);

  return json({
    success: true,
    message: "Login successful",
    token,
    student: {
      studentid: student.studentid,
      username: student.username,
      classgroup: student.classgroup
    }
  });
}


  
async function submitAbsentAttendance(request, env) {
  const authUser = await getAuthUser(request, env);

  if (!authUser || authUser.type !== "admin") {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  const body = await request.json();

  const date = String(body.date || "").trim();

  const absentStudents = Array.isArray(body.absentStudents)
    ? body.absentStudents
    : [];

  if (!date) {
    return json({ success: false, error: "Missing date" }, 400);
  }

  for (const student of absentStudents) {
    if (!student.studentid) {
      return json({
        success: false,
        error: "Missing studentid in absent list"
      }, 400);
    }

    if (authUser.role === "TEACHER" && student.classgroup !== authUser.assignedgroup) {
      return json({
        success: false,
        error: "Teacher cannot submit attendance for another group"
      }, 403);
    }
  }

  const result = await callAppsScript(env, {
    action: "submitAbsentStudents",
    data: {
      date,
    absentStudents,
    adminid: authUser.adminid
    }
  });

  return json(result);
}

async function attendanceStudents(request, env) {
  const authUser = await getAuthUser(request, env);

  if (!authUser || authUser.type !== "admin") {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  const body = await request.json();

  let classgroup = String(body.classgroup || "ALL").trim();

  if (authUser.role === "TEACHER") {
    classgroup = authUser.assignedgroup;
  }

  const result = await callAppsScript(env, {
    action: "getStudentsForAttendance",
    classgroup
  });

  return json(result);
}

async function attendanceReport(request, env) {
  const authUser = await getAuthUser(request, env);

  if (!authUser || authUser.type !== "admin") {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  const body = await request.json();

  const startDate = String(body.startDate || "").trim();
  const endDate = String(body.endDate || "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return json({ success: false, error: "startDate must be YYYY-MM-DD" }, 400);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return json({ success: false, error: "endDate must be YYYY-MM-DD" }, 400);
  }

  let classgroup = String(body.classgroup || "ALL").trim();

  if (authUser.role === "TEACHER") {
    classgroup = authUser.assignedgroup;
  }

  const result = await callAppsScript(env, {
    action: "getAttendanceReport",
    data: {
      startDate,
      endDate,
      classgroup
    }
  });

  return json(result);
}



async function resetPin(request, env) {
  const authUser = await getAuthUser(request, env);

  if (!authUser || authUser.type !== "admin") {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  if (authUser.role !== "ADMIN" && authUser.role !== "SENIOR") {
    return json({ success: false, error: "Forbidden" }, 403);
  }

  const body = await request.json();
  const uniqueid = body.uniqueid;

  if (!uniqueid) {
    return json({ success: false, error: "Missing uniqueid" }, 400);
  }

  const result = await callAppsScript(env, {
    action: "resetStudentPin",
    uniqueid
  });

  return json(result);
}

async function checkStudentDuplicateAdmin(request, env) {
  const permission = await requireAdminOrSenior(request, env);

  if (!permission.ok) {
    return permission.response;
  }

  const body = await request.json();

  const username = body.username;
  const whatsapp6 = normalizeWhatsapp6(body.whatsapp6);
  const classgroup = body.classgroup;

  if (!username) {
    return json({ success: false, error: "Missing username" }, 400);
  }

  if (!classgroup) {
    return json({ success: false, error: "Missing classgroup" }, 400);
  }

  const result = await callAppsScript(env, {
    action: "checkStudentDuplicate",
    data: {
      username,
      whatsapp6,
      classgroup
    }
  });

  return json(result);
}

async function registerStudentAdmin(request, env) {
  const permission = await requireAdminOrSenior(request, env);

  if (!permission.ok) {
    return permission.response;
  }

  const body = await request.json();

  const username = String(body.username || "").trim();
  const whatsapp6 = normalizeWhatsapp6(body.whatsapp6);
  const classgroup = String(body.classgroup || "1").trim();
  const confirmDuplicate = body.confirmDuplicate === true;
  const assignmentMode = body.assignmentMode === "selected" ? "selected" : "all";
  const selectedModules = Array.isArray(body.selectedModules) ? body.selectedModules : [];

  if (!username) {
    return json({ success: false, error: "Missing username" }, 400);
  }

  if (!classgroup) {
    return json({ success: false, error: "Missing classgroup" }, 400);
  }

  // Manual subject/module assignment is temporarily disabled in the frontend.
  // If an older page submits selected mode without modules, safely fall back to all active tasks.
  const safeAssignmentMode = assignmentMode === "selected" && selectedModules.length > 0 ? "selected" : "all";

  const registeredby = String(
    permission.user.username ||
    permission.user.name ||
    permission.user.adminid ||
    permission.user.uniqueid ||
    "ADMIN"
  ).trim();

  const result = await callAppsScript(env, {
    action: "registerStudent",
    data: {
      username,
      whatsapp6,
      classgroup,
      confirmDuplicate,
      registeredby,
      registeredbyAdminId: permission.user.adminid || "",
      assignmentMode: safeAssignmentMode,
      selectedModules: safeAssignmentMode === "selected" ? selectedModules : []
    }
  });

  return json(result);
}

async function updateStudentAdmin(request, env) {
  const permission = await requireAdminOrSenior(request, env);

  if (!permission.ok) {
    return permission.response;
  }

  const body = await request.json();

  const uniqueid = body.uniqueid;

  if (!uniqueid) {
    return json({ success: false, error: "Missing uniqueid" }, 400);
  }

  if (body.username !== undefined && String(body.username).trim() === "") {
    return json({ success: false, error: "Username cannot be empty" }, 400);
  }

  if (body.classgroup !== undefined && String(body.classgroup).trim() === "") {
    return json({ success: false, error: "classgroup cannot be empty" }, 400);
  }

  if (
    body.active !== undefined &&
    typeof body.active !== "boolean"
  ) {
    return json({ success: false, error: "active must be true or false" }, 400);
  }

  const updateData = {
    uniqueid
  };

  if (body.username !== undefined) {
    updateData.username = String(body.username).trim();
  }

  if (body.whatsapp6 !== undefined) {
    updateData.whatsapp6 = normalizeWhatsapp6(body.whatsapp6);
  }

  if (body.classgroup !== undefined) {
    updateData.classgroup = String(body.classgroup).trim();
  }

  if (body.active !== undefined) {
    updateData.active = body.active;
  }

  const result = await callAppsScript(env, {
    action: "updateStudent",
    data: updateData
  });

  return json(result);
}

async function searchStudentsAdmin(request, env) {
  const permission = await requireAdminOrSenior(request, env);

  if (!permission.ok) {
    return permission.response;
  }

  const body = await request.json();
  const query = String(body.query || "").trim();
  const whatsapp6 = String(body.whatsapp6 || "").replace(/\D/g, "").slice(-6);
  const listAll = body.listAll === true;

  if (!query && !whatsapp6 && !listAll) {
    return json({ success: false, error: "Enter a name or WhatsApp last 6 digits" }, 400);
  }

  const result = await callAppsScript(env, {
    action: "searchStudents",
    data: {
      query,
      whatsapp6,
      listAll
    }
  });

  return json(result);
}

async function getStudentAssignmentOptionsAdmin(request, env) {
  const permission = await requireAdminOrSenior(request, env);

  if (!permission.ok) {
    return permission.response;
  }

  const result = await callAppsScript(env, {
    action: "getStudentAssignmentOptions"
  });

  return json(result);
}

async function createSubjectAdmin(request, env) {
  const permission = await requireAdminOrSenior(request, env);

  if (!permission.ok) {
    return permission.response;
  }

  const body = await request.json();

  const subjectName = String(body.subjectName || "").trim();

  if (!subjectName) {
    return json({ success: false, error: "Missing subjectName" }, 400);
  }

  const result = await callAppsScript(env, {
    action: "createSubject",
    data: {
      subjectName
    }
  });

  return json(result);
}

async function listSubjectsAdmin(request, env) {
  const authUser = await getAuthUser(request, env);

  if (!authUser || authUser.type !== "admin") {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  const result = await callAppsScript(env, {
    action: "listSubjects"
  });

  return json(result);
}

async function updateSubjectAdmin(request, env) {
  const permission = await requireAdminOrSenior(request, env);

  if (!permission.ok) {
    return permission.response;
  }

  const body = await request.json();

  const subjectid = String(body.subjectid || "").trim();

  if (!subjectid) {
    return json({ success: false, error: "Missing subjectid" }, 400);
  }

  const updateData = {
    subjectid
  };

  if (body.subjectName !== undefined) {
    const subjectName = String(body.subjectName || "").trim();

    if (!subjectName) {
      return json({ success: false, error: "Subject name cannot be empty" }, 400);
    }

    updateData.subjectName = subjectName;
  }

  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") {
      return json({ success: false, error: "active must be true or false" }, 400);
    }

    updateData.active = body.active;
  }

  const result = await callAppsScript(env, {
    action: "updateSubject",
    data: updateData
  });

  return json(result);
}
async function createSubjectResourceAdmin(request, env) {
  const permission = await requireAdminOrSenior(request, env);

  if (!permission.ok) {
    return permission.response;
  }

  const body = await request.json();

  const subjectid = String(body.subjectid || "").trim();
  const resourceName = String(body.resourceName || "").trim();
  const resourceType = String(body.resourceType || "").trim().toUpperCase();
  const resourceLink = String(body.resourceLink || "").trim();

  if (!subjectid) {
    return json({ success: false, error: "Missing subjectid" }, 400);
  }

  if (!resourceName) {
    return json({ success: false, error: "Missing resourceName" }, 400);
  }

  if (!resourceType) {
    return json({ success: false, error: "Missing resourceType" }, 400);
  }

  if (!resourceLink) {
    return json({ success: false, error: "Missing resourceLink" }, 400);
  }

  const allowedTypes = ["PDF", "AUDIO", "VIDEO", "IMAGE", "LINK", "TEXT", "OTHER"];

  if (!allowedTypes.includes(resourceType)) {
    return json({ success: false, error: "Invalid resourceType" }, 400);
  }

  const result = await callAppsScript(env, {
    action: "createSubjectResource",
    data: {
      subjectid,
      resourceName,
      resourceType,
      resourceLink
    }
  });

  return json(result);
}

async function listSubjectResourcesAdmin(request, env) {
  const authUser = await getAuthUser(request, env);

  if (!authUser || authUser.type !== "admin") {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  const body = await request.json();

  const subjectid = String(body.subjectid || "ALL").trim();

  const result = await callAppsScript(env, {
    action: "listSubjectResources",
    subjectid
  });

  return json(result);
}

async function updateSubjectResourceAdmin(request, env) {
  const permission = await requireAdminOrSenior(request, env);

  if (!permission.ok) {
    return permission.response;
  }

  const body = await request.json();

  const resourceid = String(body.resourceid || "").trim();

  if (!resourceid) {
    return json({ success: false, error: "Missing resourceid" }, 400);
  }

  const updateData = {
    resourceid
  };

  if (body.subjectid !== undefined) {
    const subjectid = String(body.subjectid || "").trim();

    if (!subjectid) {
      return json({ success: false, error: "subjectid cannot be empty" }, 400);
    }

    updateData.subjectid = subjectid;
  }

  if (body.resourceName !== undefined) {
    const resourceName = String(body.resourceName || "").trim();

    if (!resourceName) {
      return json({ success: false, error: "resourceName cannot be empty" }, 400);
    }

    updateData.resourceName = resourceName;
  }

  if (body.resourceType !== undefined) {
    const resourceType = String(body.resourceType || "").trim().toUpperCase();
    const allowedTypes = ["PDF", "AUDIO", "VIDEO", "IMAGE", "LINK", "TEXT", "OTHER"];

    if (!allowedTypes.includes(resourceType)) {
      return json({ success: false, error: "Invalid resourceType" }, 400);
    }

    updateData.resourceType = resourceType;
  }

  if (body.resourceLink !== undefined) {
    const resourceLink = String(body.resourceLink || "").trim();

    if (!resourceLink) {
      return json({ success: false, error: "resourceLink cannot be empty" }, 400);
    }

    updateData.resourceLink = resourceLink;
  }

  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") {
      return json({ success: false, error: "active must be true or false" }, 400);
    }

    updateData.active = body.active;
  }

  const result = await callAppsScript(env, {
    action: "updateSubjectResource",
    data: updateData
  });

  return json(result);
}
async function createTaskAdmin(request, env) {
  const permission = await requireAdminOrSenior(request, env);

  if (!permission.ok) {
    return permission.response;
  }

  const body = await request.json();

  const subjectid = String(body.subjectid || "").trim();
  const taskName = String(body.taskName || "").trim();

  const audioLink = String(body.audioLink || "").trim();
  const visualLink = String(body.visualLink || "").trim();
  const videoLink = String(body.videoLink || "").trim();
  const pdfLink = String(body.pdfLink || "").trim();

  if (!subjectid) {
    return json({ success: false, error: "Missing subjectid" }, 400);
  }

  if (!taskName) {
    return json({ success: false, error: "Missing taskName" }, 400);
  }

  const result = await callAppsScript(env, {
    action: "createTask",
    data: {
      subjectid,
      taskName,
      audioLink,
      visualLink,
      videoLink,
      pdfLink
    }
  });

  return json(result);
}

async function listTasksAdmin(request, env) {
  const authUser = await getAuthUser(request, env);

  if (!authUser || authUser.type !== "admin") {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  const body = await request.json();

  const subjectid = String(body.subjectid || "ALL").trim();
  const activeOnly = body.activeOnly === true;

  const result = await callAppsScript(env, {
    action: "listTasks",
    data: {
      subjectid,
      activeOnly
    }
  });

  return json(result);
}

async function updateTaskAdmin(request, env) {
  const permission = await requireAdminOrSenior(request, env);

  if (!permission.ok) {
    return permission.response;
  }

  const body = await request.json();

  const taskid = String(body.taskid || "").trim();

  if (!taskid) {
    return json({ success: false, error: "Missing taskid" }, 400);
  }

  const updateData = {
    taskid
  };

  if (body.subjectid !== undefined) {
    const subjectid = String(body.subjectid || "").trim();

    if (!subjectid) {
      return json({ success: false, error: "subjectid cannot be empty" }, 400);
    }

    updateData.subjectid = subjectid;
  }

  if (body.taskName !== undefined) {
    const taskName = String(body.taskName || "").trim();

    if (!taskName) {
      return json({ success: false, error: "taskName cannot be empty" }, 400);
    }

    updateData.taskName = taskName;
  }

  if (body.audioLink !== undefined) {
    updateData.audioLink = String(body.audioLink || "").trim();
  }

  if (body.visualLink !== undefined) {
    updateData.visualLink = String(body.visualLink || "").trim();
  }

  if (body.videoLink !== undefined) {
    updateData.videoLink = String(body.videoLink || "").trim();
  }

  if (body.pdfLink !== undefined) {
    updateData.pdfLink = String(body.pdfLink || "").trim();
  }

  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") {
      return json({ success: false, error: "active must be true or false" }, 400);
    }

    updateData.active = body.active;
  }

  const result = await callAppsScript(env, {
    action: "updateTask",
    data: updateData
  });

  return json(result);
}

async function assignTasksAdmin(request, env) {
  const permission = await requireAdminOrSenior(request, env);

  if (!permission.ok) {
    return permission.response;
  }

  const authUser = permission.user;
  const body = await request.json();

  const data = {
    assignedBy: authUser.adminid,
    taskids: Array.isArray(body.taskids) ? body.taskids : [],
    studentids: Array.isArray(body.studentids) ? body.studentids : [],
    classgroup: String(body.classgroup || "").trim(),
    assignAllStudents: body.assignAllStudents === true,
    assignAllTasksForSubject: body.assignAllTasksForSubject === true,
    subjectid: String(body.subjectid || "").trim()
  };

  const result = await callAppsScript(env, {
    action: "assignTasksToStudents",
    data
  });

  return json(result);
}
async function getStudentTasksEndpoint(request, env) {
  const authUser = await getAuthUser(request, env);

  if (!authUser) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  const body = await request.json();

  let studentid = String(body.studentid || "").trim();
  const subjectid = String(body.subjectid || "ALL").trim();

  if (authUser.type === "student") {
    studentid = authUser.studentid;
  }

  if (authUser.type === "admin") {
    if (!studentid) {
      return json({ success: false, error: "Missing studentid" }, 400);
    }
  }

  if (!studentid) {
    return json({ success: false, error: "Missing studentid" }, 400);
  }

  const result = await callAppsScript(env, {
    action: "getStudentTasks",
    data: {
      studentid,
      subjectid
    }
  });

  return json(result);
}
async function updateTaskComplete(request, env) {
  const authUser = await getAuthUser(request, env);

  if (!authUser) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  const body = await request.json();

  const studenttaskid = String(body.studenttaskid || "").trim();
  const complete = body.complete === true;

  if (!studenttaskid) {
    return json({ success: false, error: "Missing studenttaskid" }, 400);
  }

  const taskResult = await callAppsScript(env, {
    action: "getStudentTaskById",
    studenttaskid
  });

  if (!taskResult.task) {
    return json({ success: false, error: "Student task not found" }, 404);
  }

  const assignedTask = taskResult.task;

  if (authUser.type === "student" && assignedTask.studentid !== authUser.studentid) {
    return json({ success: false, error: "Forbidden" }, 403);
  }

  if (authUser.type === "admin") {
    if (authUser.role === "TEACHER" && assignedTask.classgroup !== authUser.assignedgroup) {
      return json({ success: false, error: "Forbidden" }, 403);
    }
  }

  const result = await callAppsScript(env, {
    action: "updateStudentTaskStatus",
    data: {
      studenttaskid,
      completeStatus: complete ? "COMPLETE" : ""
    }
  });

  return json(result);
}
async function verifyStudentTask(request, env) {
  const authUser = await getAuthUser(request, env);

  if (!authUser || authUser.type !== "admin") {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  const body = await request.json();

  const studenttaskid = String(body.studenttaskid || "").trim();
  const verified = body.verified === true;

  if (!studenttaskid) {
    return json({ success: false, error: "Missing studenttaskid" }, 400);
  }

  const taskResult = await callAppsScript(env, {
    action: "getStudentTaskById",
    studenttaskid
  });

  if (!taskResult.task) {
    return json({ success: false, error: "Student task not found" }, 404);
  }

  const assignedTask = taskResult.task;

  if (authUser.role === "TEACHER" && assignedTask.classgroup !== authUser.assignedgroup) {
    return json({ success: false, error: "Forbidden" }, 403);
  }

  const result = await callAppsScript(env, {
    action: "updateStudentTaskStatus",
    data: {
      studenttaskid,
      verifyStatus: verified ? "VERIFIED" : ""
    }
  });

  return json(result);
}
async function taskProgressReport(request, env) {
  const authUser = await getAuthUser(request, env);

  if (!authUser) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  const body = await request.json();

  let studentid = String(body.studentid || "ALL").trim();
  let classgroup = String(body.classgroup || "ALL").trim();
  const subjectid = String(body.subjectid || "ALL").trim();

  if (authUser.type === "student") {
    studentid = authUser.studentid;
    classgroup = "ALL";
  }

  if (authUser.type === "admin" && authUser.role === "TEACHER") {
    classgroup = authUser.assignedgroup;
  }

  const result = await callAppsScript(env, {
    action: "getTaskProgressReport",
    data: {
      studentid,
      classgroup,
      subjectid
    }
  });

  return json(result);
}

async function taskProgressDetail(request, env) {
  const authUser = await getAuthUser(request, env);

  if (!authUser) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  const body = await request.json();

  let studentid = String(body.studentid || "ALL").trim();
  let classgroup = String(body.classgroup || "ALL").trim();
  const subjectid = String(body.subjectid || "ALL").trim();
  const taskid = String(body.taskid || "ALL").trim();

  if (authUser.type === "student") {
    studentid = authUser.studentid;
    classgroup = "ALL";
  }

  if (authUser.type === "admin" && authUser.role === "TEACHER") {
    classgroup = authUser.assignedgroup;
  }

  const result = await callAppsScript(env, {
    action: "getTaskProgressDetail",
    data: {
      studentid,
      classgroup,
      subjectid,
      taskid
    }
  });

  return json(result);
}













async function createSessionToken(payload, env) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);

  const body = {
    ...payload,
    iat: now,
    exp: now + 60 * 60 * 24 * 7
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedBody = base64url(JSON.stringify(body));
  const data = `${encodedHeader}.${encodedBody}`;
  const signature = await sign(data, env.SESSION_SECRET);

  return `${data}.${signature}`;
}

async function verifySessionToken(token, env) {
  const parts = token.split(".");

  if (parts.length !== 3) {
    return null;
  }

  const [header, body, signature] = parts;
  const data = `${header}.${body}`;
  const expectedSignature = await sign(data, env.SESSION_SECRET);

  if (signature !== expectedSignature) {
    return null;
  }

  const payload = JSON.parse(
    atob(body.replace(/-/g, "+").replace(/_/g, "/"))
  );

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}

async function sign(data, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data)
  );

  return [...new Uint8Array(signature)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function base64url(input) {
  return btoa(input)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}


async function requireAdminOrSenior(request, env) {
  const authUser = await getAuthUser(request, env);

  if (!authUser || authUser.type !== "admin") {
    return {
      ok: false,
      response: json({ success: false, error: "Unauthorized" }, 401)
    };
  }

  if (authUser.role !== "ADMIN" && authUser.role !== "SENIOR") {
    return {
      ok: false,
      response: json({ success: false, error: "Forbidden" }, 403)
    };
  }

  return {
    ok: true,
    user: authUser
  };
}

async function getResourcesEndpoint(request, env) {
  const authUser = await getAuthUser(request, env);

  if (!authUser) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  const result = await callAppsScript(env, {
    action: "getStudentResources",
    data: {}
  });

  return json(result);
}


async function getAuthUser(request, env) {
  const auth = request.headers.get("Authorization");

  if (!auth || !auth.startsWith("Bearer ")) {
    return null;
  }

  const token = auth.replace("Bearer ", "").trim();
  return verifySessionToken(token, env);
}




async function hashPin(pin, secret) {
  const data = new TextEncoder().encode(pin + secret);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  return [...new Uint8Array(hashBuffer)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeWhatsapp6(value) {
  const digits = String(value || "").replace(/\D/g, "");

  if (!digits) {
    return "999999";
  }

  return digits.slice(-6).padStart(6, "0");
}

async function callAppsScript(env, payload) {
  if (!env.APPS_SCRIPT_URL) {
    throw new Error("Missing APPS_SCRIPT_URL environment variable");
  }

  const response = await fetch(env.APPS_SCRIPT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(
      "Apps Script returned non-JSON response. HTTP " +
      response.status +
      ". First 200 chars: " +
      text.slice(0, 200)
    );
  }

  if (!response.ok) {
    throw new Error(
      "Apps Script HTTP error " +
      response.status +
      ": " +
      JSON.stringify(data).slice(0, 200)
    );
  }

  return data;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    }
  });
}

function corsResponse() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    }
  });
}
