import { AwsEc2QueryProtocol, XmlShapeDeserializer } from "@aws-sdk/core/protocols";
import { getValueFromTextNode } from "@smithy/core/client";
import { XMLParser } from "fast-xml-parser";

// Convex has Fetch but no DOM. Keep AWS's schema handling and replace only
// its browser XML reader with a parser that does not require browser globals.
class AwsXmlDeserializer extends XmlShapeDeserializer {
  protected parseXml(xml: string) {
    if (!xml.length) return {};
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      parseTagValue: false,
      parseAttributeValue: false,
      trimValues: true,
      ignoreDeclaration: true,
      ignorePiTags: true,
    });
    const document = parser.parse(xml);
    return getValueFromTextNode(document[Object.keys(document)[0]]);
  }
}

export class AwsComputeQueryProtocol extends AwsEc2QueryProtocol {
  constructor(options: ConstructorParameters<typeof AwsEc2QueryProtocol>[0]) {
    super(options);
    this.deserializer = new AwsXmlDeserializer(this.deserializer.settings);
  }
}
