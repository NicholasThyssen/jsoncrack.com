import React from "react";
import type { ModalProps } from "@mantine/core";
import { Modal, Stack, Text, ScrollArea, Flex, CloseButton, Textarea, Button } from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import type { NodeData } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";
import useFile from "../../../store/useFile";
import useJson from "../../../store/useJson";

// return object from json removing array and object fields
const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";
  if (nodeRows.length === 1 && !nodeRows[0].key) return `${nodeRows[0].value}`;

  const obj = {};
  nodeRows?.forEach(row => {
    if (row.type !== "array" && row.type !== "object") {
      if (row.key) obj[row.key] = row.value;
    }
  });
  return JSON.stringify(obj, null, 2);
};

// return json path in the format $["customer"]
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

export const NodeModal = ({ opened, onClose }: ModalProps) => {
  const nodeData = useGraph(state => state.selectedNode);
  const setSelectedNode = useGraph(state => state.setSelectedNode);
  const setContents = useFile(state => state.setContents);
  const getJson = useJson(state => state.getJson);

  const [editing, setEditing] = React.useState(false);
  const [editValue, setEditValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const getValueAtPath = (obj: any, path?: NodeData["path"]) => {
    if (!path || path.length === 0) return obj;
    let cur = obj;
    for (const seg of path) {
      if (cur === undefined || cur === null) return undefined;
      cur = cur[seg as any];
    }
    return cur;
  };

  const setValueAtPath = (obj: any, path: NodeData["path"] | undefined, value: any) => {
    if (!path || path.length === 0) return value;
    const clone = Array.isArray(obj) ? [...obj] : { ...obj };
    let cur: any = clone;
    for (let i = 0; i < path.length; i++) {
      const seg = path[i];
      if (i === path.length - 1) {
        cur[seg as any] = value;
      } else {
        if (cur[seg as any] === undefined) {
          // create object container if missing
          cur[seg as any] = typeof path[i + 1] === "number" ? [] : {};
        }
        cur = cur[seg as any];
      }
    }
    return clone;
  };

  React.useEffect(() => {
    // reset editing state when node changes
    setEditing(false);
    setError(null);
    try {
      const parsed = JSON.parse(getJson());
      const current = getValueAtPath(parsed, nodeData?.path);
      setEditValue(JSON.stringify(current, null, 2));
    } catch (err) {
      // fallback to normalized node representation
      setEditValue(normalizeNodeData(nodeData?.text ?? []));
    }
  }, [nodeData, getJson]);

  const handleSave = () => {
    setError(null);
    try {
      const parsedNew = JSON.parse(editValue);

      // get current whole json, update value at path and write back
      const whole = JSON.parse(getJson());
      const updated = setValueAtPath(whole, nodeData?.path, parsedNew);

      setContents({ contents: JSON.stringify(updated, null, 2), hasChanges: true });
      // Optimistically rebuild the graph now so nodes reflect the change
      // immediately and the modal shows updated content.
      try {
        useGraph.getState().setGraph(JSON.stringify(updated, null, 2));
        const targetPath = nodeData?.path ? JSON.stringify(nodeData.path) : undefined;
        if (targetPath) {
          const nodes = useGraph.getState().nodes;
          const found = nodes.find(n => JSON.stringify(n.path) === targetPath);
          if (found) {
            setSelectedNode(found);
          }
        }
      } catch (e) {
        // ignore - setContents will eventually update the graph
      }
      setEditing(false);
    } catch (err: any) {
      setError(err?.message ?? "Invalid JSON");
    }
  };

  return (
    <Modal size="auto" opened={opened} onClose={onClose} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        <Stack gap="xs">
        
          <Flex justify="space-between" align="center">
            <Text fz="xs" fw={500}>
              Content
            </Text>

            <Flex align="center" gap="xs">
              {!editing ? (
                <Button
                  size="xs"
                  variant="subtle"
                  onClick={() => {
                    // initialize editValue from current JSON and enter edit mode
                    try {
                      const parsed = JSON.parse(getJson());
                      const current = getValueAtPath(parsed, nodeData?.path);
                      setEditValue(JSON.stringify(current, null, 2));
                    } catch (err) {
                      setEditValue(normalizeNodeData(nodeData?.text ?? []));
                    }
                    setEditing(true);
                  }}
                >
                  Edit
                </Button>
              ) : null}

              <CloseButton onClick={onClose} />
            </Flex>
          </Flex>

          <ScrollArea.Autosize mah={250} maw={600}>
            {editing ? (
              <div>
                <Textarea
                  value={editValue}
                  onChange={e => setEditValue(e.currentTarget.value)}
                  minRows={6}
                  style={{ fontFamily: "monospace" }}
                />
                <Flex justify="flex-end" gap="xs" mt="xs">
                  <Button size="xs" variant="default" onClick={handleSave}>
                    Save
                  </Button>
                  <Button
                    size="xs"
                    variant="subtle"
                    onClick={() => {
                      setEditing(false);
                      setError(null);
                      try {
                        const parsed = JSON.parse(getJson());
                        const current = getValueAtPath(parsed, nodeData?.path);
                        setEditValue(JSON.stringify(current, null, 2));
                      } catch (err) {
                        setEditValue(normalizeNodeData(nodeData?.text ?? []));
                      }
                    }}
                  >
                    Cancel
                  </Button>
                </Flex>
                {error ? (
                  <Text fz="xs" c="red" mt="xs">
                    {error}
                  </Text>
                ) : null}
              </div>
            ) : (
              <CodeHighlight
                code={normalizeNodeData(nodeData?.text ?? [])}
                miw={350}
                maw={600}
                language="json"
                withCopyButton
              />
            )}
          </ScrollArea.Autosize>
        </Stack>
        <Text fz="xs" fw={500}>
          JSON Path
        </Text>
        <ScrollArea.Autosize maw={600}>
          <CodeHighlight
            code={jsonPathToString(nodeData?.path)}
            miw={350}
            mah={250}
            language="json"
            copyLabel="Copy to clipboard"
            copiedLabel="Copied to clipboard"
            withCopyButton
          />
        </ScrollArea.Autosize>
      </Stack>
    </Modal>
  );
};
