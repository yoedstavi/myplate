/**
 * This file will automatically be loaded by webpack and run in the "renderer" context.
 * To learn more about the differences between the "main" and the "renderer" context in
 * Electron, visit:
 *
 * https://electronjs.org/docs/latest/tutorial/process-model
 *
 * By default, Node.js integration in this file is disabled. When enabling Node.js integration
 * in a renderer process, please be aware of potential security implications. You can read
 * more about security risks here:
 *
 * https://electronjs.org/docs/tutorial/security
 *
 * To enable Node.js integration in this file, open up `main.js` and enable the `nodeIntegration`
 * flag:
 *
 * ```
 *  // Create the browser window.
 *  mainWindow = new BrowserWindow({
 *    width: 800,
 *    height: 600,
 *    webPreferences: {
 *      nodeIntegration: true
 *    }
 *  });
 * ```
 */

import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.min.css';
import './index.css';
import * as bootstrap from 'bootstrap'
import ace from 'ace-builds'
import {
  getAllBlockedBy,
  getAllBlocking,
  removeFromAllDependencyLists,
  addTaskToDependencyList,
  removeTaskFromDependencyList,
  sortTasksByDependency,
} from './task_dependency'

declare namespace tasksDataStorage {
  function saveToJsonFile(tasksData: Object): void;
  function loadFromJsonFile(): Promise<Object>;
  function disableSaveOnUnload(callback: Function): void;
  function triggerReload(): void;
}

// HACK to resolve issue with webpack, fix this when you are smarter
declare namespace crypto {
  function randomUUID(): `${string}-${string}-${string}-${string}-${string}`;
}

const taskDataMeta = new Object;
let taskSortNeeded: boolean;
export let taskData: Object;
export let taskOrder: string[];

export type ObjKey = keyof Object;

export type TaskData = {
  showDetails: boolean,
  title: string,
  notes: string,
  isDone: boolean,
  dependencyList: string[]
};

export type TaskDataMeta = {
  isNew: boolean,
  isVisible: boolean,
  isDoneVisible: boolean,
  snoozeUntil: number,
  // non-data
  taskCollapse: any,
  doneTaskCollapse: any,
  taskWake: Function,
  doneButton: HTMLButtonElement | undefined
};

export function setTaskOrder(newTaskOrder: string[], flagNeeded: boolean = false) {
  taskOrder = newTaskOrder;
  if (flagNeeded)
    taskSortNeeded = true;
}

export function defaultTaskMeta(isNew: boolean): TaskDataMeta {
  return {
    isNew: isNew,
    isVisible: true,
    isDoneVisible: false,
    snoozeUntil: 0,
    taskCollapse: undefined,
    doneTaskCollapse: undefined,
    taskWake: (): void => undefined,
    doneButton: undefined
  };
}

let saveOnUnload = true;
tasksDataStorage.disableSaveOnUnload(() => {
  saveOnUnload = false;
  tasksDataStorage.triggerReload();
})

function resolveTaskByUuid(uuid: string): TaskData {
  return taskData[uuid as ObjKey] as unknown as TaskData;
}

function resolveTaskMetaByUuid(uuid: string): TaskDataMeta {
  return taskDataMeta[uuid as ObjKey] as unknown as TaskDataMeta;
}

const myActiveTasks = document.getElementById("myActiveTasks") as HTMLDivElement;
const myDoneTasks = document.getElementById("myDoneTasks") as HTMLDivElement;
const showSnoozed = document.getElementById("showSnoozedButton") as HTMLInputElement;
const showSnoozedLabel = document.getElementById("showSnoozedLabel") as HTMLLabelElement;
const hideBlocked = document.getElementById("hideBlockedButton") as HTMLInputElement;
const hideBlockedLabel = document.getElementById("hideBlockedLabel") as HTMLLabelElement;
const placeholderTasks = document.getElementById("placeholderTasks") as HTMLDivElement;
const placeholderDoneTasks = document.getElementById("placeholderDoneTasks") as HTMLDivElement;
const thisTaskDependsOnOtherDiv = document.getElementById("thisTaskDependsOnOtherModal") as HTMLDivElement;
const otherTasksDepenOnThisDiv = document.getElementById("otherTasksDepenOnThisModal") as HTMLDivElement;
const blockingTasksList = document.getElementById("blockingTasksList") as HTMLDivElement;
const blockedByTasksList = document.getElementById("blockedByTasksList") as HTMLDivElement;
const saveButton = document.getElementById("saveButton") as HTMLButtonElement;
const sortTasksButton = document.getElementById("sortTasksButton") as HTMLButtonElement;
let thisTaskDependsOnOtherModal: bootstrap.Modal | undefined = undefined;
let otherTasksDepenOnThisModal: bootstrap.Modal | undefined = undefined;

let noChangeCounter = 1000;
let autoSaveHandle: NodeJS.Timeout | undefined = undefined;
let placeholderTasksVisible = false;
let placeholderDoneTasksVisible = false;

new bootstrap.Tooltip(sortTasksButton);

function startPeriodicSave() {
  autoSaveHandle = setTimeout(periodicAutoSave, 1000, JSON.stringify(taskData));
}

function saveTaskData(closing = false) {
  clearTimeout(autoSaveHandle as NodeJS.Timeout);
  noChangeCounter = 1000;
  tasksDataStorage.saveToJsonFile(taskData);
  saveButton.disabled = true;
  if (!closing)
    startPeriodicSave();
}

function saveButtonHandler() {
  saveTaskData();
}

function periodicAutoSave(refTaskData: string) {
  ++noChangeCounter;

  if (refTaskData != JSON.stringify(taskData)) {
    noChangeCounter = 0;
    saveButton.disabled = false;
  }

  if (noChangeCounter == 20) {
    saveTaskData();
    return;
  }
  startPeriodicSave();
}

function isSnoozed(taskMeta: TaskDataMeta) {
  return (Date.now() < taskMeta.snoozeUntil);
}

function evaluateTaskVisibility(taskObj: TaskData, taskMeta: TaskDataMeta, uuid: string) {
  // Expand this function when advanced filters are implemented
  return (
    !taskObj.isDone &&
    (!isSnoozed(taskMeta) || showSnoozed.checked) &&
    (taskObj.dependencyList.length == 0 || !hideBlocked.checked)
  );
}

type getTaskIdsRet = {
  collapseButtonId: string,
  collapseTargetId: string,
  editButtonId: string,
  titleTextColId: string,
  editCol1Id: string,
  titleInputId: string,
  titleTextId: string,
  taskBodyEditorId: string,
  deleteTaskButtonId: string,
  doneTaskButtonId: string,
  snoozeTaskButtonId: string,
  historicTaskId: string,
  restoreTaskButtonId: string,
  historicDeleteButtonId: string,
  blockedByButtonId: string,
  blockingButtonId: string,
};

function getTaskIds(uuid: string): getTaskIdsRet {
  return {
    collapseButtonId: 'taskTitle-' + uuid,
    collapseTargetId: 'taskNote-' + uuid,
    editButtonId: 'edit-' + uuid,
    titleTextColId: 'titleCol-' + uuid,
    editCol1Id: 'editCol1-' + uuid,
    titleInputId: 'titleInput-' + uuid,
    titleTextId: 'titleText-' + uuid,
    taskBodyEditorId: 'taskBody-' + uuid,
    deleteTaskButtonId: 'deleteTask-' + uuid,
    doneTaskButtonId: 'doneTask-' + uuid,
    snoozeTaskButtonId: 'snoozeTask-' + uuid,
    historicTaskId: 'historic-' + uuid,
    restoreTaskButtonId: 'restore-' + uuid,
    historicDeleteButtonId: 'historicDelete-' + uuid,
    blockedByButtonId: 'blockedBy-' + uuid,
    blockingButtonId: 'blocking-' + uuid,
  }
}

function addTaskToPage(uuid: string, taskObj: TaskData) {
  const newTask = document.createElement("div");
  newTask.id = uuid;
  const taskMeta = resolveTaskMetaByUuid(uuid);
  newTask.classList.add("mb-2", "accordion", "collapse", "scroll-margin-task");
  if (taskMeta.isVisible)
    newTask.classList.add("show");

  const tids = getTaskIds(uuid);
  newTask.innerHTML = `
      <div class="accordion-item">
        <div class="accordion-header">
          <button class="accordion-button collapsed" type="button" data-bs-target="#${tids.collapseTargetId}"
            data-bs-toggle="collapse" aria-expanded="false" aria-controls="${tids.collapseTargetId}"
            id="${tids.collapseButtonId}">
            <div class="container-fluid g-0 me-2">
              <div class="row align-items-center">
                <div class="col" id="${tids.titleTextColId}">
                  <span id="${tids.titleTextId}"></span>
                  &nbsp;&nbsp;&nbsp;<i class="bi bi-pencil"
                   data-bs-toggle="tooltip" data-bs-placement="top" data-bs-title="shortcut: e" id="${tids.editButtonId}"></i>
                </div>
                <div class="col d-none" id="${tids.editCol1Id}">
                  <input class="form-control" type="text" placeholder="Task Title" id="${tids.titleInputId}"/>
                </div>
              </div>
            </div>
          </button>
        </div>
        <div id="${tids.collapseTargetId}" class="accordion-collapse collapse">
          <div class="accordion-body row">
            <div id="${tids.taskBodyEditorId}" class="container-fluid col border-end"></div>
            <div class="fixed-width-col g-0 ps-2">
              <div class="d-grid gap-1">              
                <button type="button" class="btn btn-primary" id="${tids.doneTaskButtonId}">Done</button>
                <button type="button" class="btn btn-secondary" id="${tids.snoozeTaskButtonId}">Snooze</button>
                <button type="button" class="btn btn-danger" id="${tids.deleteTaskButtonId}">Delete</button>
                <div class="btn-group">
                  <button type="button" class="btn btn-info" id="${tids.blockingButtonId}"
                    data-bs-toggle="tooltip" data-bs-placement="top" data-bs-title="Blocking ...">
                    <i class="bi bi-arrow-down-right"></i>
                  </button>
                  <button type="button" class="btn btn-info" id="${tids.blockedByButtonId}"
                    data-bs-toggle="tooltip" data-bs-placement="top" data-bs-title="Blocked by ...">
                    <i class="bi bi-arrow-up-left"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  myActiveTasks.appendChild(newTask);

  const newDoneTask = document.createElement("div");
  newDoneTask.id = tids.historicTaskId;
  newDoneTask.classList.add("collapse", "row", "mx-auto", "mb-1");
  if (taskObj.isDone) {
    newDoneTask.classList.add("show");
    taskMeta.isDoneVisible = true;
  }
  newDoneTask.innerHTML = `
    <div class="text-truncate col border py-1 align-middle me-0">
      ${taskObj.title}
    </div>
    <div class="col-auto btn-group gx-0">
      <button type="button" id="${tids.restoreTaskButtonId}"
        class="btn btn-primary">
        Restore
      </button>
      <button type="button" id="${tids.historicDeleteButtonId}"
        class="btn btn-danger">
        Delete
      </button>
    </div>
  `;

  myDoneTasks.appendChild(newDoneTask);
  initTaskElements(newTask, newDoneTask, taskObj, taskMeta, uuid, tids);
}

function initTaskElements(
  newTask: HTMLDivElement,
  newDoneTask: HTMLDivElement,
  taskObj: TaskData,
  taskMeta: TaskDataMeta,
  uuid: string,
  tids: getTaskIdsRet) {
  const editButton = document.getElementById(tids.editButtonId) as HTMLElement;
  const collapseButton = document.getElementById(tids.collapseButtonId) as HTMLButtonElement;
  const titleInput = document.getElementById(tids.titleInputId) as HTMLInputElement;
  const titleText = document.getElementById(tids.titleTextId) as HTMLSpanElement;
  const taskDetails = document.getElementById(tids.collapseTargetId) as HTMLDivElement;
  const titleTextCol = document.getElementById(tids.titleTextColId) as HTMLDivElement;
  const editCol1 = document.getElementById(tids.editCol1Id) as HTMLDivElement;
  const doneTaskButton = document.getElementById(tids.doneTaskButtonId) as HTMLButtonElement;
  const restoreTaskButton = document.getElementById(tids.restoreTaskButtonId) as HTMLButtonElement;
  const deleteTaskButton = document.getElementById(tids.deleteTaskButtonId) as HTMLButtonElement;
  const historicDeleteButton = document.getElementById(tids.historicDeleteButtonId) as HTMLButtonElement;
  const snoozeTaskButton = document.getElementById(tids.snoozeTaskButtonId) as HTMLButtonElement;
  const blockedByButton = document.getElementById(tids.blockedByButtonId) as HTMLButtonElement;
  const blockingButton = document.getElementById(tids.blockingButtonId) as HTMLButtonElement;

  taskMeta.taskCollapse = bootstrap.Collapse.getOrCreateInstance(newTask, { toggle: false });
  taskMeta.doneTaskCollapse = bootstrap.Collapse.getOrCreateInstance(newDoneTask, { toggle: false });
  taskMeta.doneButton = doneTaskButton;

  titleText.innerText = taskObj.title;

  const aceEditor = ace.edit(tids.taskBodyEditorId, {
    autoScrollEditorIntoView: true,
    maxLines: 40,
    minLines: 10,
    printMargin: false,
  });
  aceEditor.session.on('change', event => taskObj.notes = aceEditor.getValue());
  aceEditor.commands.addCommand({
    name: 'exitFocus',
    bindKey: 'Escape',
    exec: (editor: ace.Editor) => {
      collapseButton.focus();
      collapseButton.click();
      // bootstrap.Collapse.getInstance(taskDetails).hide(); // make this work well sometime
    },
    readOnly: true,
  });

  // save the collapsed state of the accordion when it's changed
  taskDetails.addEventListener("hide.bs.collapse", () => taskObj.showDetails = false);
  taskDetails.addEventListener("show.bs.collapse", () => taskObj.showDetails = true);
  if (taskObj.showDetails) {
    taskDetails.classList.add('show');
    collapseButton.classList.remove('collapsed');
    collapseButton.setAttribute('aria-expanded', 'true');
  }

  // A function to edit the task title with a shortcut or a button
  const taskEditFunction = () => taskEditTitle(titleInput,
    titleText,
    titleTextCol,
    editCol1,
    collapseButton);

  // bind a shortcut to edit the title
  collapseButton.addEventListener("keydown", event => {
    if (event.key === 'e') {
      taskEditFunction();
    }
  });

  // A function to save the task title with a shortcut or a button
  const taskEditTitleDoneFunction = () => taskEditTitleDone(uuid,
    titleInput,
    titleTextCol,
    editCol1,
    collapseButton,
    titleText);

  titleInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      // we don't want the Enter key to affect the accordion or the ace editor
      setTimeout(() => {
        taskEditTitleDoneFunction();
        collapseButton.focus();
      });
    }
    else if (event.key === "Escape") {
      titleInput.value = taskObj.title;
      taskEditTitleDoneFunction();
      collapseButton.focus();
    }
  });
  titleInput.addEventListener("blur", taskEditTitleDoneFunction);

  // functions to disable the accordion collapse for inner buttons
  const pauseCollapse = () => collapseButton.removeAttribute("data-bs-toggle");
  const resumeCollapse = () => collapseButton.setAttribute("data-bs-toggle", "collapse");

  editButton.addEventListener("click", taskEditFunction);
  editButton.addEventListener("mouseenter", pauseCollapse);
  editButton.addEventListener("mouseleave", resumeCollapse);
  new bootstrap.Tooltip(editButton);

  // implement the Done button of a task
  doneTaskButton.addEventListener("click", () => {
    taskObj.isDone = true;
    removeFromAllDependencyLists(uuid);
  });
  restoreTaskButton.addEventListener("click", () => {
    taskObj.isDone = false;
  });
  evaluateDoneButtonState(uuid, taskObj);

  // implement the Snooze button of a task
  taskMeta.taskWake = () => {
    taskMeta.snoozeUntil = 0;
    snoozeTaskButton.innerText = "Snooze";
  }

  snoozeTaskButton.addEventListener("click", () => {
    if (taskMeta.snoozeUntil == 0) {
      taskMeta.snoozeUntil = Date.now() + 10 * 60000; // Hard coded 10 minutes
      snoozeTaskButton.innerText = "Wake";
    } else
      taskMeta.taskWake();
  });


  // implement the Delete button of a task
  const deleteTaskImp = () => {
    newTask.remove();
    newDoneTask.remove();
    delete taskData[uuid as ObjKey];
    delete taskDataMeta[uuid as ObjKey];
    taskOrder.splice(taskOrder.lastIndexOf(uuid), 1);
    removeFromAllDependencyLists(uuid);
  }
  deleteTaskButton.addEventListener("click", deleteTaskImp);
  historicDeleteButton.addEventListener("click", deleteTaskImp);

  // implement the dependency buttons
  new bootstrap.Tooltip(blockedByButton);
  new bootstrap.Tooltip(blockingButton);

  blockedByButton.addEventListener("click", () => {
    fillBlockedByTasks(uuid, taskObj.title, taskObj.dependencyList);
    (thisTaskDependsOnOtherModal as bootstrap.Modal).show();
  });

  blockingButton.addEventListener("click", () => {
    fillBlockingTasks(uuid, taskObj.title);
    (otherTasksDepenOnThisModal as bootstrap.Modal).show();
  });

  if (taskMeta.isNew) {
    taskEditFunction();
    aceEditor.setValue(taskObj.notes); // default init text, selected
    // The full collapsible element is not immediately in view
    setTimeout(() => newTask.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    taskMeta.isNew = false;
  }
  else
    aceEditor.setValue(taskObj.notes, -1);  // cursor at doc start, without selections
}

function addTaskButtonHandler() {
  const uuid = crypto.randomUUID();
  const taskObj: TaskData = {
    showDetails: true,
    title: '',
    notes: 'Task Notes',
    isDone: false,
    dependencyList: []
  };

  Object.defineProperty(taskData, uuid, {
    value: taskObj,
    configurable: true,
    enumerable: true
  });
  Object.defineProperty(taskDataMeta, uuid, {
    value: defaultTaskMeta(true),
    configurable: true,
    enumerable: true
  });
  addTaskToPage(uuid, taskObj);
}

function taskEditTitle(titleInput: HTMLInputElement, titleText: HTMLSpanElement, titleTextCol: HTMLDivElement,
  editCol1: HTMLDivElement, collapseButton: HTMLButtonElement) {
  // needed to ignore the edit shortcut
  if (titleInput.getAttribute("is-modified"))
    return;

  // put the input in a modify state to signal that the Done Handler is needed
  titleInput.setAttribute("is-modified", "yes");

  // Hide header, show Edit controls
  titleTextCol.classList.add("d-none");
  editCol1.classList.remove("d-none");
  collapseButton.disabled = true;
  // set the input text to the current Header text
  setTimeout(() => {
    titleInput.value = titleText.innerText;
    titleInput.select();
  });
}

function taskEditTitleDone(uuid: string, inputElement: HTMLInputElement, titleTextCol: HTMLDivElement,
  editCol1: HTMLDivElement, collapseButton: HTMLButtonElement, titleText: HTMLSpanElement) {
  // check if this handler is necessary or was already called
  if (!inputElement.getAttribute("is-modified"))
    return;

  // Show header, hide Edit controls
  titleTextCol.classList.remove("d-none");
  editCol1.classList.add("d-none");
  collapseButton.disabled = false;
  // set the Header text to the current input text
  titleText.innerText = inputElement.value;
  const task = resolveTaskByUuid(uuid);
  task.title = inputElement.value;
  inputElement.removeAttribute("is-modified");
}

// Check if the task may become "Done"
function evaluateDoneButtonState(uuid: string, taskObj: TaskData): void {
  const taskMeta = resolveTaskMetaByUuid(uuid);
  const btn = (taskMeta.doneButton as HTMLButtonElement);
  btn.disabled = (taskObj.dependencyList.length != 0);
}

function fillBlockingTasks(uuid: string, title: string) {
  const allBlockedBySet = getAllBlockedBy(uuid);
  const eventGuide = new Map<string, {
    blocking: boolean,
    uuid: string,
    taskObj: TaskData,
  }>();
  let content = '<h3 class="fs-5">Tasks blocked by: ' + title + '</h3>';
  for (const [taskId, taskObj] of Object.entries(taskData)) {
    // prevent circular dependency
    if (taskId == uuid || taskObj.isDone || allBlockedBySet.has(taskId))
      continue;

    const ctrl = crypto.randomUUID();
    const blocking = (taskObj.dependencyList.lastIndexOf(uuid) != -1);
    eventGuide.set(ctrl, {
      blocking: blocking,
      uuid: taskId,
      taskObj: taskObj,
    });
    content += `
      <div class="input-group mb-3">
        <div class="input-group-text">
          <input class="form-check-input mt-0" type="checkbox"
            ${blocking ? "checked" : ""}
            id="${ctrl}">
        </div>
        <div class="input-group-text w-75">
          <div class="text-start text-truncate w-100">
            ${taskObj.title}
          </div>
        </div>
      </div>
    `;
  }
  blockingTasksList.replaceChildren();
  blockingTasksList.innerHTML = content;

  // Now the elements exist, attach the events
  for (const [id, obj] of eventGuide) {
    const checkbox = document.getElementById(id) as HTMLInputElement;
    const checkFunc = () => {
      addTaskToDependencyList(obj.taskObj, uuid);
      evaluateDoneButtonState(obj.uuid, obj.taskObj);
      checkbox.removeEventListener("click", checkFunc);
      checkbox.addEventListener("click", uncheckFunc);
    };

    const uncheckFunc = () => {
      removeTaskFromDependencyList(obj.taskObj, uuid);
      evaluateDoneButtonState(obj.uuid, obj.taskObj);
      checkbox.removeEventListener("click", uncheckFunc);
      checkbox.addEventListener("click", checkFunc);
    };

    if (obj.blocking)
      checkbox.addEventListener("click", uncheckFunc);
    else
      checkbox.addEventListener("click", checkFunc);
  }
}

function fillBlockedByTasks(uuid: string, title: string, dependencyList: string[]) {
  const immediateBlockedBySet = new Set(dependencyList);
  const allBlocking = getAllBlocking(uuid);
  const eventGuide = new Map<string, {
    blockedBy: boolean,
    uuid: string,
  }>();
  let content = '<h3 class="fs-5">Tasks that are blocking: ' + title + '</h3>';
  for (const [taskId, taskObj] of Object.entries(taskData)) {
    // prevent circular dependency
    if (taskId == uuid || taskObj.isDone || allBlocking.has(taskId))
      continue;

    const ctrl = crypto.randomUUID();
    const blockedBy = immediateBlockedBySet.has(taskId);
    eventGuide.set(ctrl, {
      blockedBy: blockedBy,
      uuid: taskId,
    });
    content += `
      <div class="input-group mb-3">
        <div class="input-group-text">
          <input class="form-check-input mt-0" type="checkbox"
            ${blockedBy ? "checked" : ""}
            id="${ctrl}">
        </div>
        <div class="input-group-text w-75">
          <div class="text-start text-truncate w-100">
            ${taskObj.title}
          </div>
        </div>
      </div>
    `;
  }
  blockedByTasksList.replaceChildren();
  blockedByTasksList.innerHTML = content;

  // Now the elements exist, attach the events
  const taskObj = resolveTaskByUuid(uuid);
  for (const [id, obj] of eventGuide) {
    const checkbox = document.getElementById(id) as HTMLInputElement;
    const checkFunc = () => {
      addTaskToDependencyList(taskObj, obj.uuid);
      evaluateDoneButtonState(uuid, taskObj);
      checkbox.removeEventListener("click", checkFunc);
      checkbox.addEventListener("click", uncheckFunc);
    };

    const uncheckFunc = () => {
      removeTaskFromDependencyList(taskObj, obj.uuid);
      evaluateDoneButtonState(uuid, taskObj);
      checkbox.removeEventListener("click", uncheckFunc);
      checkbox.addEventListener("click", checkFunc);
    };

    if (obj.blockedBy)
      checkbox.addEventListener("click", uncheckFunc);
    else
      checkbox.addEventListener("click", checkFunc);
  }
}

const navClock = document.getElementById("navClock") as HTMLDivElement;
function modifyClock() {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, "0");
  const minutes = now.getMinutes().toString().padStart(2, "0");
  const seconds = now.getSeconds().toString().padStart(2, "0");
  const currentTime = `${hours}:${minutes}:${seconds}`;
  navClock.innerText = currentTime;
}

function wakeAllSnoozedTasks() {
  for (const [uuid, taskMeta] of Object.entries(taskDataMeta)) {
    if (taskMeta.snoozeUntil)
      taskMeta.taskWake();
  }
}

// placeholders -- text to display when there's nothing else to display
function placeholders(visibleTasks: number, doneTasks: number) {
  if (visibleTasks == 0) {
    if (!placeholderTasksVisible) {
      placeholderTasks.classList.remove("d-none");
      placeholderTasksVisible = true;
    }
  }
  else if (placeholderTasksVisible) {
    placeholderTasks.classList.add("d-none");
    placeholderTasksVisible = false;
  }

  if (doneTasks == 0) {
    if (!placeholderDoneTasksVisible) {
      placeholderDoneTasks.classList.remove("d-none");
      placeholderDoneTasksVisible = true;
    }
  }
  else if (placeholderDoneTasksVisible) {
    placeholderDoneTasks.classList.add("d-none");
    placeholderDoneTasksVisible = false;
  }
}

function periodicStuff() {
  modifyClock();
  let doneTasks = 0;
  let visibleTasks = 0;
  for (const [uuid, taskObjAny] of Object.entries(taskData)) {
    const taskObj = taskObjAny as TaskData;
    const taskMeta = resolveTaskMetaByUuid(uuid);
    const v = evaluateTaskVisibility(taskObj, taskMeta, uuid);
    const toggleVisible = (taskMeta.isVisible != v);
    if (v) {
      ++visibleTasks;
      if (toggleVisible)
        taskMeta.taskCollapse.show();

    }
    else if (toggleVisible)
      taskMeta.taskCollapse.hide();

    taskMeta.isVisible = v;

    if (taskMeta.snoozeUntil && !isSnoozed(taskMeta))
      taskMeta.taskWake();

    // check if the done list needs updating
    if (taskObj.isDone && !taskMeta.isDoneVisible) {
      taskMeta.doneTaskCollapse.show();
      taskMeta.isDoneVisible = true;
    }
    else if (!taskObj.isDone && taskMeta.isDoneVisible) {
      taskMeta.doneTaskCollapse.hide();
      taskMeta.isDoneVisible = false;
    }

    if (taskObj.isDone)
      ++doneTasks;
  }

  placeholders(visibleTasks, doneTasks);

  // Enable the sort button if needed
  if (taskSortNeeded) {
    sortTasksButton.disabled = false;
    taskSortNeeded = false;
  }
}

function addAllTasksToPage() {
  for (const uuid of taskOrder) {
    const taskObj = resolveTaskByUuid(uuid);
    addTaskToPage(uuid, taskObj);
  }
}

function refreshPageTasks() {
  // clear existing child elements
  myActiveTasks.replaceChildren(placeholderTasks);
  myDoneTasks.replaceChildren(placeholderDoneTasks);
  addAllTasksToPage();
}

function sortButtonHandler() {
  refreshPageTasks();
  sortTasksButton.disabled = true;
}

async function loadInitData() {
  taskData = await tasksDataStorage.loadFromJsonFile();

  thisTaskDependsOnOtherModal = new bootstrap.Modal(thisTaskDependsOnOtherDiv as Element);
  otherTasksDepenOnThisModal = new bootstrap.Modal(otherTasksDepenOnThisDiv as Element);

  taskOrder = sortTasksByDependency();
  for (const [uuid, taskObj] of Object.entries(taskData)) {
    const taskMeta = defaultTaskMeta(false);
    taskMeta.isVisible = evaluateTaskVisibility(taskObj, taskMeta, uuid);
    Object.defineProperty(taskDataMeta, uuid, {
      value: taskMeta,
      configurable: true,
      enumerable: true
    });
  };
  addAllTasksToPage();

  // enable the navbar buttons
  const addTaskButton = document.getElementById("addTaskButton") as HTMLButtonElement;
  const wakeAllButton = document.getElementById("wakeAllButton") as HTMLButtonElement;

  addTaskButton.addEventListener("click", addTaskButtonHandler);
  saveButton.addEventListener("click", saveButtonHandler);
  wakeAllButton.addEventListener("click", wakeAllSnoozedTasks);
  sortTasksButton.addEventListener("click", sortButtonHandler);
  showSnoozed.addEventListener("click", event => showSnoozedLabel.innerText =
    showSnoozed.checked ? 'Hide Snoozed' : 'Show Snoozed');
  hideBlocked.addEventListener("click", event => hideBlockedLabel.innerText =
    hideBlocked.checked ? 'Show Blocked' : 'Hide Blocked');

  addTaskButton.disabled = false;
  showSnoozed.disabled = false;
  wakeAllButton.disabled = false;
  hideBlocked.disabled = false;


  startPeriodicSave();
  setInterval(periodicStuff, 200);
}

loadInitData()

window.addEventListener('beforeunload', (ev) => {
  if (saveOnUnload)
    saveTaskData(true);
});
