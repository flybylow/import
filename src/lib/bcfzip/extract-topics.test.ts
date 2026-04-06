import assert from "node:assert/strict";
import test from "node:test";

import { allIfcGuidsFromViewpointXml, parseBcfMarkupXml } from "./extract-topics";

const SAMPLE_MARKUP = `<?xml version="1.0" encoding="utf-8"?>
<Markup xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Header>
    <File IfcProject="0Zkicpwzn4Pv88LVMaNj4L">
      <Filename>WAARDO-Kanaalplaatvloer.ifc</Filename>
      <Date>2015-04-01T06:28:17.6140576Z</Date>
    </File>
  </Header>
  <Topic Guid="56d65605-13a4-4fe5-a6f4-0ec1926935ca">
    <Title>Opmerking</Title>
  </Topic>
  <Comment Guid="56d65605-13a4-4fe5-a6f4-0ec1926935ca">
    <VerbalStatus>MULTICOM</VerbalStatus>
    <Date>2015-04-10T12:14:20.5995111Z</Date>
    <Author>Ligtvoet Joep</Author>
    <Comment>#03 Instort voorzieningen van FEK graag verwerken.</Comment>
    <Topic Guid="56d65605-13a4-4fe5-a6f4-0ec1926935ca" />
  </Comment>
</Markup>`;

test("parseBcfMarkupXml extracts header file, topic title, comment", () => {
  const p = parseBcfMarkupXml(SAMPLE_MARKUP);
  assert.equal(p.linkedIfcFiles.length, 1);
  assert.equal(p.linkedIfcFiles[0].filename, "WAARDO-Kanaalplaatvloer.ifc");
  assert.equal(p.linkedIfcFiles[0].ifcProject, "0Zkicpwzn4Pv88LVMaNj4L");
  assert.equal(p.topicTitles.get("56d65605-13a4-4fe5-a6f4-0ec1926935ca"), "Opmerking");
  assert.equal(p.comments.length, 1);
  assert.equal(p.comments[0].author, "Ligtvoet Joep");
  assert.match(p.comments[0].comment, /Instort voorzieningen/);
});

test("allIfcGuidsFromViewpointXml collects unique IfcGuid attributes", () => {
  const xml = `
  <VisualizationInfo>
    <Components>
      <Component IfcGuid="2W0002di$W12R7u0uww000" />
      <Component IfcGuid="2W0002di$W12R7u0uww000" />
      <Component IfcGuid="3X1111ej$X23S8v1vxx111" />
    </Components>
  </VisualizationInfo>`;
  const g = allIfcGuidsFromViewpointXml(xml);
  assert.deepEqual(g, ["2W0002di$W12R7u0uww000", "3X1111ej$X23S8v1vxx111"]);
});

test("allIfcGuidsFromViewpointXml returns empty for empty Components", () => {
  assert.deepEqual(allIfcGuidsFromViewpointXml("<Components />"), []);
});
