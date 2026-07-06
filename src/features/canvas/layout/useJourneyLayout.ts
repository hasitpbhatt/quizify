import { useEffect, useRef } from 'react';
import { useReactFlow, useNodes, useNodesInitialized } from '@xyflow/react';
import { useSessionStore } from '@/shared/stores/sessionStore';
import type { CanvasNode, QuizData } from '@/shared/types';

const NODE_WIDTH = 380;
const GAP_X = 120;
const INITIAL_Y = 100;
const INITIAL_X = 100;

export function useJourneyLayout(sessionId: string) {
  const nodesInitialized = useNodesInitialized();
  const { getNodes } = useReactFlow();
  const rfNodesState = useNodes();
  const updateCurrent = useSessionStore(s => s.updateCurrent);
  
  const nodeDimensionsHash = rfNodesState.map(n => 
    `${n.id}:${n.measured?.width ?? 0}x${n.measured?.height ?? 0}`
  ).join('|');

  const lastLaidOutHash = useRef<string>('');

  useEffect(() => {
    if (!nodesInitialized) return;
    if (nodeDimensionsHash === lastLaidOutHash.current) return;

    const rfNodes = getNodes();
    if (rfNodes.length === 0) return;

    lastLaidOutHash.current = nodeDimensionsHash;

    const session = useSessionStore.getState().sessions.find(s => s.id === sessionId);
    if (!session) return;
    const canvasNodes = session.nodes;
    
    const concepts: CanvasNode[] = [];
    const groups = new Map<string, CanvasNode[]>();
    let summaryNode: CanvasNode | undefined;

    for (const node of canvasNodes) {
      if (node.type === 'concept') {
        concepts.push(node);
        groups.set(node.id, [node]);
      } else if (node.type === 'quiz') {
        const parentId = (node.data as unknown as QuizData).parentConceptId;
        const targetId = parentId && groups.has(parentId) ? parentId : concepts[concepts.length - 1]?.id;
        const group = groups.get(targetId);
        if (group) group.push(node);
      } else if (node.type === 'summary') {
        summaryNode = node;
      }
    }

    const updatedNodes = [...canvasNodes];
    let currentX = INITIAL_X;

    // Strict horizontal layout: every node gets a new column
    for (const concept of concepts) {
      const group = groups.get(concept.id);
      if (!group) continue;

      for (const node of group) {
        const rfNode = rfNodes.find(n => n.id === node.id);
        const dimWidth = rfNode?.measured?.width ?? NODE_WIDTH;
        
        const nIndex = updatedNodes.findIndex(n => n.id === node.id);
        if (nIndex === -1) continue;

        updatedNodes[nIndex] = { ...node, position: { x: currentX, y: INITIAL_Y } };
        currentX += dimWidth + GAP_X;
      }
    }

    if (summaryNode) {
      const nIndex = updatedNodes.findIndex(n => n.id === summaryNode?.id);
      if (nIndex !== -1) {
        updatedNodes[nIndex] = { ...summaryNode, position: { x: currentX, y: INITIAL_Y } };
      }
    }

    let hasPositionChanges = false;
    for (let i = 0; i < canvasNodes.length; i++) {
      if (canvasNodes[i].position.x !== updatedNodes[i].position.x || canvasNodes[i].position.y !== updatedNodes[i].position.y) {
        hasPositionChanges = true;
        break;
      }
    }

    if (hasPositionChanges) {
      updateCurrent({ nodes: updatedNodes, updatedAt: Date.now() });
    }

  }, [nodesInitialized, nodeDimensionsHash, getNodes, updateCurrent, sessionId]);
}
