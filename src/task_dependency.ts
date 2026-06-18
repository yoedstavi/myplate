
import { TaskData, ObjKey, taskData, taskOrder, setTaskOrder } from './renderer'

class StringSet extends Set<string> { };

export function getAllBlockedBy(uuid: string, evaluated?: StringSet): StringSet {
    if (evaluated == undefined)
        evaluated = new StringSet;
    else if (evaluated.has(uuid))
        return new StringSet;

    evaluated.add(uuid);
    let blockingSet = new StringSet;
    const taskObj = taskData[uuid as ObjKey] as unknown as TaskData;
    for (const taskId of taskObj.dependencyList) {
        blockingSet.add(taskId);
        const innerDependency = getAllBlockedBy(taskId, evaluated);
        innerDependency.forEach((t: string) => blockingSet.add(t));
    }
    return blockingSet;
}

export function getAllBlocking(uuid: string): StringSet {
    const blockedSet = new StringSet;
    for (const taskId in taskData) {
        if (getAllBlockedBy(taskId).has(uuid))
            blockedSet.add(taskId);
    }
    return blockedSet;
}

class DependencyMap extends Map<string, StringSet> { };
function buildTempDependencyMap(): DependencyMap {
    let map = new DependencyMap;
    for (const [uuid, taskObj] of Object.entries(taskData)) {
        map.set(uuid, new StringSet(taskObj.dependencyList as string[]));
    }
    return map;
}

function sortDependencyMap(map: DependencyMap, sorted?: string[]): string[] {
    if (sorted == undefined)
        sorted = new Array<string>();

    let uuid_selected = "";

    for (const [uuid, deps] of map) {
        if (deps.size == 0) {
            uuid_selected = uuid;
            break;
        }
    }
    if (uuid_selected) {
        map.delete(uuid_selected);
        sorted.push(uuid_selected);
        for (const [, deps] of map)
            deps.delete(uuid_selected)
    }
    else // we assume at least one task has no dependency
        return sorted;

    return sortDependencyMap(map, sorted);
}

export function sortTasksByDependency(): string[] {
    return sortDependencyMap(buildTempDependencyMap());
}

export function removeFromAllDependencyLists(uuid: string): string[] {
    const ret: string[] = [];
    for (const [taskId, taskObjAny] of Object.entries(taskData)) {
        const taskObj = taskObjAny as TaskData;
        if(removeTaskFromDependencyList(taskObj, uuid, true))
            ret.push(taskId);
    }
    checkTaskOrder();
    return ret;
}

function checkTaskOrder(): void {
    const newTaskOrder = sortTasksByDependency();
    let breakIdx = Math.min(newTaskOrder.length, taskOrder.length);
    let i = 0;
    for (const t of newTaskOrder) {
        if (t != taskOrder[i++]) {
            setTaskOrder(newTaskOrder, true);
            return;
        }
        if (i == breakIdx)
            break;
    }


    // Update without flagging
    if (taskOrder.length != newTaskOrder.length)
        setTaskOrder(newTaskOrder);
}

export function addTaskToDependencyList(taskObj: TaskData, uuidToAdd: string) {
    taskObj.dependencyList.push(uuidToAdd);
    checkTaskOrder();
}

export function removeTaskFromDependencyList(taskObj: TaskData, uuidToRemove: string, skipCheck = false): boolean {
    const i = taskObj.dependencyList.lastIndexOf(uuidToRemove);
    let ret = false;
    if (i >= 0) {
        taskObj.dependencyList.splice(i, 1);
        ret = true;
    }

    if (!skipCheck)
        checkTaskOrder();

    return ret;
}

